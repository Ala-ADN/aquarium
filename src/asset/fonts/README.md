# CV font

`DejaVuSansMono.woff` is DejaVu Sans Mono Regular 2.37, converted losslessly
from the upstream TrueType font to WOFF without subsetting or changing metrics.
It includes Latin text, box drawing, and block elements used by the CV art.

Upstream: https://dejavu-fonts.github.io/
License: `public/licenses/dejavu/LICENSE.txt` (also served with the app).

To regenerate with Python FontTools:

```python
from fontTools.ttLib import TTFont

font = TTFont("DejaVuSansMono.ttf")
font.flavor = "woff"
font.save("src/asset/fonts/DejaVuSansMono.woff")
```
