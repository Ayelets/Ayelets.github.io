"""Build web-sized WebP copies of the artworks in images/.

Run from the repo root:  python3 tools/optimize_images.py
Writes images/web/<slug>.webp (large) and <slug>-sm.webp (grid size),
then prints the <figure> markup to paste into index.html.
"""
from pathlib import Path
from PIL import Image

SRC = Path("images")
OUT = SRC / "web"
LARGE, SMALL = 1800, 760  # longest side / width, in px

# Original file (title) -> URL-safe slug, in gallery order.
WORKS = [
    ("להכין קפה", "making-coffee"),
    ("אווזי הבר", "wild-geese"),
    ("השועל והחסידה", "fox-and-stork"),
    ("לובשת הזברה פיג׳מה", "zebra-pajamas"),
    ("מגן היצורים קול קורא", "creature-guardian"),
    ("מלון הילברט", "hilbert-hotel"),
    ("נמרים", "tigers"),
    ("סרטן השד גדל בזמן השינה", "growing-while-sleeping"),
    ("קופים", "monkeys"),
    ("קופים משחקים", "monkeys-playing"),
    ("שועלי פנרוז A4", "penrose-foxes"),
    ("פיל", "elephant"),
    ("גברת עם סלים", "lady-with-baskets"),
]


def flatten(im):
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        bg = Image.new("RGBA", im.size, (255, 255, 255, 255))
        bg.alpha_composite(im)
        return bg.convert("RGB")
    return im.convert("RGB")


def main():
    OUT.mkdir(exist_ok=True)
    for title, slug in WORKS:
        im = flatten(Image.open(SRC / f"{title}.png"))
        big = im.copy()
        big.thumbnail((LARGE, LARGE), Image.LANCZOS)
        big.save(OUT / f"{slug}.webp", quality=86, method=6)
        small = im.copy()
        small.thumbnail((SMALL, SMALL * 4), Image.LANCZOS)
        small.save(OUT / f"{slug}-sm.webp", quality=82, method=6)
        title_clean = title.replace(" A4", "")
        print(
            f'      <figure class="work" style="--r:{big.width / big.height:.3f}">\n'
            f'        <a href="images/web/{slug}.webp" data-title="{title_clean}">\n'
            f'          <img src="images/web/{slug}-sm.webp" srcset="images/web/{slug}-sm.webp {small.width}w, images/web/{slug}.webp {big.width}w"\n'
            f'               sizes="(max-width: 700px) 92vw, 40vw" width="{big.width}" height="{big.height}" loading="lazy" decoding="async" alt="{title_clean}">\n'
            f'        </a>\n'
            f'        <figcaption>{title_clean}</figcaption>\n'
            f'      </figure>'
        )


if __name__ == "__main__":
    main()
