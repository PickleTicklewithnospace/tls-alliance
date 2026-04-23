# Background Removal: Pickle Tickle Character Isolation

How the character in `Pickle Tickle.png` was extracted from its ornate frame, sun backdrop, and surrounding weapons — leaving only the character on a transparent background.

## TL;DR

- ML background-removal models (rembg variants: `u2net`, `isnet-anime`, `birefnet-portrait`, etc.) all failed because they treat the entire framed artwork as one foreground subject
- **OpenCV GrabCut** with hand-picked seed regions worked perfectly
- Final cleanup with hole-filling + largest-connected-component selection

## Why ML models failed

Tried 8 rembg models. All kept the full framed artwork (frame + sun + character + polearms + shield) as one piece, OR faded the character out entirely.

| Model | Result |
|---|---|
| u2net | Kept frame + sun + everything |
| u2netp | Faded ghost |
| u2net_human_seg | Only kept polearm tip |
| silueta | Inner content kept, sun still there |
| isnet-anime | Too translucent |
| isnet-general-use | Whole framed art |
| birefnet-portrait | Whole framed art |
| birefnet-general | Cleanest cut around full frame, but full artwork |

Reason: the character's pink/blonde hair shares hue with the orange sun behind it; the dark armor blends into the dark frame. Models treated it as one object.

## What worked: OpenCV GrabCut with seeded mask

GrabCut is iterative graph-cut segmentation. By telling it explicitly which pixels are definitely background and definitely foreground, it propagates the segmentation across the whole image.

### Seed mask layout

```
+-----------------------------+
|##### definite BG (margin) ##|
|##                          ##|
|##  PR_BG  +-------+  PR_BG ##|
|##  (pole) | char  | (pole) ##|
|##  band   |  PR_FG|  band  ##|
|##         |+-----+|        ##|
|##         ||FG   ||        ##|
|##         ||torso||        ##|
|##         |+-----+|        ##|
|##         +-------+        ##|
|##############################|
+-----------------------------+
```

- **Outer 30px margin** → `GC_BGD` (definite background)
- **Vertical bands at x ∈ [10%-22%] and [78%-90%]** → `GC_BGD` (the polearms)
- **Center rectangle x ∈ [32%-70%], y ∈ [20%-92%]** → `GC_PR_FGD` (probable foreground = character region)
- **Inner torso rectangle x ∈ [42%-62%], y ∈ [40%-80%]** → `GC_FGD` (definite foreground)
- Everything else → `GC_PR_BGD`

Then run `cv2.grabCut` for 8 iterations with `GC_INIT_WITH_MASK`.

### Code

```python
import numpy as np
import cv2
from PIL import Image
from scipy.ndimage import label, binary_fill_holes

orig = Image.open('Pickle Tickle.png').convert('RGBA')
arr = np.array(orig)
H, W = arr.shape[:2]
img = arr[..., :3][..., ::-1].copy()  # PIL RGB -> cv2 BGR

# Seed mask
mask = np.full((H, W), cv2.GC_PR_BGD, dtype=np.uint8)

# Outer margin -> definite background
margin = 30
mask[:margin, :] = cv2.GC_BGD
mask[-margin:, :] = cv2.GC_BGD
mask[:, :margin] = cv2.GC_BGD
mask[:, -margin:] = cv2.GC_BGD

# Character body region -> probable foreground
mask[int(H*0.20):int(H*0.92), int(W*0.32):int(W*0.70)] = cv2.GC_PR_FGD

# Torso center -> definite foreground
mask[int(H*0.40):int(H*0.80), int(W*0.42):int(W*0.62)] = cv2.GC_FGD

# Polearm vertical bands -> definite background
mask[int(H*0.25):int(H*0.95), int(W*0.10):int(W*0.22)] = cv2.GC_BGD
mask[int(H*0.25):int(H*0.95), int(W*0.78):int(W*0.90)] = cv2.GC_BGD

# Run GrabCut
bgdModel = np.zeros((1, 65), np.float64)
fgdModel = np.zeros((1, 65), np.float64)
cv2.grabCut(img, mask, None, bgdModel, fgdModel, 8, cv2.GC_INIT_WITH_MASK)

# Build alpha from result
fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD))

# Cleanup: fill holes, keep largest connected component
fg = binary_fill_holes(fg)
lbl, n = label(fg)
sizes = np.bincount(lbl.ravel())
sizes[0] = 0
keep = (lbl == int(np.argmax(sizes)))
final_alpha = (keep.astype(np.uint8)) * 255

out = np.dstack([arr[..., :3], final_alpha])
Image.fromarray(out, 'RGBA').save('Pickle Tickle.png')
```

## Lessons

- For "art with character inside an ornate frame" type images, off-the-shelf bg removal models fail
- Seeded GrabCut (or Segment Anything Model with point prompts) is far more reliable when you can give the algorithm hints about where the subject lives
- Always work on a copy: my first pass overwrote the original and required user to restore it
- Largest-connected-component + hole-filling are simple but powerful post-processing steps

## Dependencies

```bash
pip install opencv-python pillow numpy scipy
```

## Repeatability for batches of portraits

**The current script is NOT generally repeatable as-is** — seed rectangles are hard-coded percentages tuned for this specific portrait (character centered, polearms at x=10-22% and 78-90%, frame margin = 30px). Different portraits = different layouts = same coordinates would seed the wrong regions.

### Options ranked by effort vs quality

#### Easy: batch-runnable IF portraits share layout
- If all portraits are the same FFXIV-style framed template (character centered in identical frame), the same hard-coded GrabCut seeds work on all of them. Just loop the script.
- Expected success: ~95% one-shot

#### Medium: semi-automatic with detected bbox
- Detect character bounding box first (MediaPipe / YOLO person detection / rembg `birefnet-portrait` rough mask)
- Derive GrabCut seed rectangles dynamically from that bbox
- Then run GrabCut as before
- Handles varying poses/positions
- Expected success: ~70-85% one-shot

#### Best: fully automatic with SAM
- **Segment Anything Model (SAM)** with auto point prompt (center of detected face/person)
- Purpose-built for "click here, get the object"; handles arbitrary compositions
- Cost: ~2.5GB model download, slower per image
- Expected success: ~85-95% one-shot

#### Hybrid (recommended for mixed difficulty)
- Run `birefnet` first
- If mask covers >80% of image (swallowing the frame), fall back to GrabCut + SAM
- Auto-routes by difficulty

### Realistic expectations for 20 mixed-difficulty portraits

| Scenario | Approach | Success rate |
|---|---|---|
| All same template | Batch script with fixed seeds | ~100% |
| Same character, varying poses | Auto-bbox + GrabCut | ~80% one-shot, 20% need manual tweak |
| Varying art styles / compositions | SAM with auto-prompt | ~85%, 3-5 of 20 need manual point-clicking |

### Key insight

The bottleneck is **seeding**, not the segmentation algorithm. Whatever pipeline you build, invest in robust automatic detection of "where is the character" — once you know that, GrabCut/SAM/matting models can finish the job reliably.

