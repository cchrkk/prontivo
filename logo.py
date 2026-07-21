import os
import zipfile
from PIL import Image, ImageDraw, ImageFont

# Crea la cartella per gli asset
os.makedirs('prontivo_assets', exist_ok=True)

NAVY = (15, 44, 89, 255)
GREEN = (15, 157, 88, 255)
SUBTITLE_COLOR = (100, 116, 139, 255)

def get_font(size, bold=True):
    try:
        font_name = "arialbd.ttf" if bold else "arial.ttf"
        return ImageFont.truetype(font_name, size)
    except:
        return ImageFont.load_default()

# 1. SOLO SCRITTA
img_wordmark = Image.new("RGBA", (1000, 300), (0, 0, 0, 0))
draw = ImageDraw.Draw(img_wordmark)
font_bold = get_font(110)

draw.text((150, 80), "PRON", font=font_bold, fill=NAVY)
draw.text((490, 80), "TIVO", font=font_bold, fill=GREEN)
img_wordmark.save("prontivo_assets/prontivo_scritta_solo.png")

# 2. SCRITTA CON DIDASCALIA
img_tagline = Image.new("RGBA", (1200, 450), (0, 0, 0, 0))
draw = ImageDraw.Draw(img_tagline)
font_sub = get_font(36, bold=False)

draw.text((250, 100), "PRON", font=font_bold, fill=NAVY)
draw.text((590, 100), "TIVO", font=font_bold, fill=GREEN)
draw.text((360, 250), "GENERATORE PREVENTIVI", font=font_sub, fill=SUBTITLE_COLOR)
img_tagline.save("prontivo_assets/prontivo_scritta_didascalia.png")

# 3. SOLO LOGO (ICONA)
img_logo = Image.new("RGBA", (600, 600), (0, 0, 0, 0))
draw = ImageDraw.Draw(img_logo)

# Disegna il foglio/icona
draw.polygon([(250, 100), (350, 100), (400, 150), (400, 450), (200, 450)], outline=NAVY, width=20)
draw.line([(200, 320), (280, 380), (420, 220)], fill=GREEN, width=28)
img_logo.save("prontivo_assets/prontivo_logo_solo.png")

# CREA ZIP
with zipfile.ZipFile("prontivo_branding_pack.zip", 'w') as zipf:
    zipf.write("prontivo_assets/prontivo_scritta_solo.png", arcname="prontivo_scritta_solo.png")
    zipf.write("prontivo_assets/prontivo_scritta_didascalia.png", arcname="prontivo_scritta_didascalia.png")
    zipf.write("prontivo_assets/prontivo_logo_solo.png", arcname="prontivo_logo_solo.png")

print("Pacchetto prontivo_branding_pack.zip creato con successo!")