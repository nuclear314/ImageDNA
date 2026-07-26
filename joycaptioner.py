"""
Wraps fancyfeast/llama-joycaption-beta-one-hf-llava for step-2 natural-language
captioning. Kept separate from tagger.py because it pulls in heavy, optional
dependencies (torch, transformers, bitsandbytes) — see requirements-joycaption.txt.

Prompt templates below come from JoyCaption's own docs:
https://github.com/fpgaminer/joycaption#how-to-prompt-joycaption
"""
from PIL import Image

MODEL_NAME = "fancyfeast/llama-joycaption-beta-one-hf-llava"

_DESCRIPTIVE_PROMPTS = {
    "casual": "Write a descriptive caption for this image in a casual tone.",
    "formal": "Write a long detailed description for this image.",
}

_MODE_PROMPTS = {
    "straightforward": (
        "Write a straightforward caption for this image. Begin with the main subject and medium. "
        "Mention pivotal elements—people, objects, scenery—using confident, definite language. "
        "Focus on concrete details like color, shape, texture, and spatial relationships. "
        "Show how elements interact. Omit mood and speculative wording. If text is present, quote it exactly. "
        "Note any watermarks, signatures, or compression artifacts. Never mention what's absent, resolution, "
        "or unobservable details. Vary your sentence structure and keep the description concise, without "
        "starting with “This image is…” or similar phrasing."
    ),
    "sd_prompt": "Output a stable diffusion prompt that is indistinguishable from a real stable diffusion prompt.",
    "midjourney": "Write a MidJourney prompt for this image.",
    "social_media": "Write a caption for this image as if it were being used for a social media post.",
}

_PROMPT_USE_SUFFIX = (
    "Your response will be used by a text-to-image model, so avoid useless meta phrases like "
    "“This image shows…”, “You are looking at...”, etc."
)


def build_prompt(mode="descriptive", tone="casual", extra_options=None, known_tags=None):
    if mode == "descriptive":
        base = _DESCRIPTIVE_PROMPTS.get(tone, _DESCRIPTIVE_PROMPTS["casual"])
    else:
        base = _MODE_PROMPTS.get(mode, _DESCRIPTIVE_PROMPTS["casual"])

    parts = [base]
    if extra_options:
        parts.extend(extra_options)
    parts.append(_PROMPT_USE_SUFFIX)
    prompt = " ".join(parts)

    if known_tags:
        tag_str = ", ".join(known_tags)
        prompt = (
            f"A specialized anime tagger has already identified these elements in the image: {tag_str}. "
            f"Treat them as verified ground truth and weave the relevant ones naturally into your response "
            f"rather than re-guessing them from scratch. {prompt}"
        )

    return prompt


class JoyCaptioner:
    def __init__(self, quantization="4bit"):
        self.quantization = quantization
        self.processor = None
        self.model = None
        self.device = None
        self._has_cuda = False
        self._load_model()

    def _load_model(self):
        import torch
        from transformers import AutoProcessor, LlavaForConditionalGeneration

        self.processor = AutoProcessor.from_pretrained(MODEL_NAME)

        has_cuda = torch.cuda.is_available()
        kwargs = {}

        if has_cuda and self.quantization in ("4bit", "8bit"):
            from transformers import BitsAndBytesConfig
            kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=self.quantization == "4bit",
                load_in_8bit=self.quantization == "8bit",
                bnb_4bit_compute_dtype=torch.bfloat16,
            )
            kwargs["device_map"] = "auto"
        elif has_cuda:
            kwargs["torch_dtype"] = torch.bfloat16
            kwargs["device_map"] = "auto"
        else:
            kwargs["torch_dtype"] = torch.float32  # CPU fallback: functional, very slow

        self.model = LlavaForConditionalGeneration.from_pretrained(MODEL_NAME, **kwargs)
        self.model.eval()
        self.device = next(self.model.parameters()).device
        self._has_cuda = has_cuda

    def caption_image(self, image_path, mode="descriptive", tone="casual", extra_options=None,
                       known_tags=None, max_new_tokens=512):
        import torch

        prompt = build_prompt(mode=mode, tone=tone, extra_options=extra_options, known_tags=known_tags)
        image = Image.open(image_path).convert("RGB")

        convo = [
            {"role": "system", "content": "You are a helpful image captioner."},
            {"role": "user", "content": prompt},
        ]
        # Per JoyCaption's own docs: this exact apply_chat_template + processor()
        # combo is the one they verify against; other combos can double up <bos>.
        convo_string = self.processor.apply_chat_template(convo, tokenize=False, add_generation_prompt=True)

        inputs = self.processor(text=[convo_string], images=[image], return_tensors="pt").to(self.device)
        target_dtype = torch.bfloat16 if self._has_cuda else torch.float32
        inputs["pixel_values"] = inputs["pixel_values"].to(target_dtype)

        with torch.no_grad():
            generate_ids = self.model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                do_sample=True,
                suppress_tokens=None,
                use_cache=True,
                temperature=0.6,
                top_k=None,
                top_p=0.9,
            )[0]

        generate_ids = generate_ids[inputs["input_ids"].shape[1]:]
        caption = self.processor.tokenizer.decode(
            generate_ids, skip_special_tokens=True, clean_up_tokenization_spaces=False
        )
        return caption.strip(), prompt

    def unload(self):
        import gc
        import torch

        self.model = None
        self.processor = None
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
