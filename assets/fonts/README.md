# Fonts

- `Manrope-variable.ttf` is the app's existing web font. `Manrope-Regular.ttf` is its static weight-400 instance for consistent PDF text. Both use the license in `OFL.txt`.
- `dejavu-sans/DejaVuSans.ttf` supplies PDF symbols missing from Manrope, including list bullets. Its license is in `dejavu-sans/LICENSE.txt`; the unchanged font and notice come from [Matplotlib's bundled DejaVu fonts](https://github.com/matplotlib/matplotlib/tree/main/lib/matplotlib/mpl-data/fonts/ttf).

The static Manrope instance can be regenerated with Python fontTools using `instantiateVariableFont(font, {"wght": 400})`.
