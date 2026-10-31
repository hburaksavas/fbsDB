"""Generate the transparent, two-tone teal fbsDB Windows icon assets.

The original fbsDB mark is retained as a color mask so its familiar F and
database silhouette stays consistent at every Windows icon size.
"""

from pathlib import Path

import numpy as np
from PIL import Image


ASSETS = Path(__file__).resolve().parents[1] / "native" / "FbsDb" / "Assets"
SOURCE = ASSETS / "AppIconTealSource.png"
MINT = np.array([137.0, 222.0, 207.0])
TEAL = np.array([22.0, 166.0, 153.0])


def resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    return image.resize(size, Image.Resampling.LANCZOS)


def save_splash(image: Image.Image) -> None:
    splash = Image.new("RGBA", (1240, 600), (0, 0, 0, 0))
    splash.alpha_composite(resize(image.convert("RGBA"), (260, 260)), (490, 170))
    splash.save(ASSETS / "SplashScreen.scale-200.png")


def main() -> None:
    image = Image.open(SOURCE).convert("RGBA")
    pixels = np.asarray(image, dtype=np.float32).copy()
    rgb = pixels[:, :, :3]

    # The original mark has near-white F/top, cyan tiers, and a navy tile.
    # Extract the two shapes as alpha masks so the tile and internal gaps
    # become transparent while antialiased edges stay smooth.
    mint = np.clip((rgb[:, :, 0] - 25.0) / 224.0, 0.0, 1.0)
    teal = np.clip((rgb[:, :, 1] - 75.0 - mint * 175.0) / 154.0, 0.0, 1.0)
    teal = np.minimum(teal, 1.0 - mint)
    coverage = mint + teal
    coverage[coverage < 0.10] = 0.0
    color = (
        mint[:, :, None] * MINT + teal[:, :, None] * TEAL
    ) / np.maximum(coverage[:, :, None], 0.0001)
    pixels[:, :, :3] = np.clip(color, 0, 255)
    pixels[:, :, 3] *= coverage
    colored = Image.fromarray(pixels.astype(np.uint8), "RGBA")

    # Fill the icon canvas with the mark now that the rounded tile is gone.
    colored = resize(colored.crop((170, 190, 1090, 1110)), (1254, 1254))

    colored.save(ASSETS / "AppIconSource.png")
    colored.save(ASSETS / "AppIcon.png")
    for name in (
        "Square150x150Logo.scale-200.png",
        "Square44x44Logo.scale-200.png",
        "StoreLogo.png",
    ):
        colored.save(ASSETS / name)

    resize(colored, (24, 24)).save(
        ASSETS / "Square44x44Logo.targetsize-24_altform-unplated.png"
    )
    resize(colored, (48, 48)).save(
        ASSETS / "Square44x44Logo.targetsize-48_altform-lightunplated.png"
    )
    resize(colored, (48, 48)).save(ASSETS / "LockScreenLogo.scale-200.png")

    wide = Image.new("RGBA", (620, 300), (0, 0, 0, 0))
    wide.alpha_composite(resize(colored, (260, 260)), (180, 20))
    wide.save(ASSETS / "Wide310x150Logo.scale-200.png")
    save_splash(colored)

    colored.save(
        ASSETS / "AppIcon.ico",
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)],
    )


if __name__ == "__main__":
    main()
