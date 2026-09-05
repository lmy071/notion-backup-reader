# 标题区：趴着翻书的猫咪

当前动画：`heading-cat-reading.png`，静态首帧：`heading-cat-reading-still.png`。320 × 260，实际 37 帧，4.84 秒循环，透明 RGBA。关闭动效时切换到静态首帧。

原创趴卧读书姿态由内置 ImageGen 生成；无透明通道的中间原图已清理。经用户授权，Pillow + NumPy 去除烘焙棋盘格，另存 lying-reading-source-transparent.png。脚本 scripts/generate-reading-cat-apng.py 在书脊处构建从右向左翻动的书页，头部与身体保持静止。透明源图用于复现当前翻页动画。

验证：37 个实际不同帧、透明像素、头部保持不动、总循环时长，以及关键帧合成检查。已清理旧的整体位移与四肢动画。

## ImageGen prompt

Use case: stylized-concept
Asset type: standalone pixel-art reading cat sprite for a website animation.
Input image: reference image only for the original cat character design and pixel-art style. Create a NEW pose and composition.
Primary request: one cute ivory cat with pink inner ears, blush cheeks, green eyes, and a sage-green scarf, lying prone comfortably behind an open book. Its belly and chest rest low on the ground, body extended horizontally back from the head; hind legs tucked behind and visibly part of the lying body; tail curled beside the body. The posture must read clearly as lying down. Chin lowered and eyes looking down at the book. Two front paws gently rest on either side of the open book, outside the page areas.
Composition: three-quarter front view, centered standalone sprite, square 1:1 canvas with comfortable transparent padding. Include the whole cat, tail, and book. The open book lies prominently across the bottom front with visible cream left and right pages and a clear central seam. Both page surfaces are unobstructed, suitable for later page-turn animation. Scarf ends stay away from the pages.
Style: crisp 16-bit Japanese anime pixel art matching the reference, clean stepped pixels, dark green outline, ivory/sage/blush palette, warm gentle expression.
Background: genuine alpha transparency throughout all empty space, not a painted checkerboard or solid background.
Avoid: sitting or upright cat posture, mug, stacks of books, pencils, flowers, extra props, floating icons, readable text, watermark, cropped anatomy. Exactly one cat and one open book.
