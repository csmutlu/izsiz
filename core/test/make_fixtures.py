"""Test için içinde kişisel meta veri olan örnek görseller üretir."""
import sys, os
from PIL import Image, PngImagePlugin

out = sys.argv[1]
os.makedirs(out, exist_ok=True)

img = Image.new("RGB", (64, 48), (200, 50, 50))
exif = Image.Exif()
exif[0x010F] = "SECRETMAKE"
exif[0x0110] = "SECRETMODEL"
exif[0x0131] = "SECRETSOFT"
exif[0x013B] = "SECRET_AUTHOR"
exif[0x0112] = 6
gps = {1: "N", 2: (41.0, 2.0, 30.0), 3: "E", 4: (29.0, 1.0, 0.0)}
exif[0x8825] = gps
xmp = b'<x:xmpmeta xmlns:x="adobe:ns:meta/"><dc:creator>SECRET_XMP</dc:creator></x:xmpmeta>'

img.save(f"{out}/photo.jpg", exif=exif, comment=b"SECRET_COMMENT", xmp=xmp)

info = PngImagePlugin.PngInfo()
info.add_text("Author", "SECRET_AUTHOR")
info.add_text("Comment", "SECRET_COMMENT", zip=True)
info.add_itxt("Description", "SECRET_DESC")
img.save(f"{out}/image.png", pnginfo=info, exif=exif)

img.save(f"{out}/image.webp", exif=exif, xmp=xmp)

g = Image.new("P", (16, 16))
g.info["comment"] = b"SECRET_COMMENT"
g.save(f"{out}/anim.gif", comment=b"SECRET_COMMENT")
print("ok")
