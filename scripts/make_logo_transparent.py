from PIL import Image
from collections import deque
import math

src = Image.open(r"src/assets/logo.jpeg").convert("RGBA")
w, h = src.size
px = src.load()

BG_REFS = [
    (229, 224, 218),
    (235, 232, 227),
    (234, 231, 226),
    (220, 213, 205),
    (223, 216, 208),
    (232, 229, 222),
    (230, 225, 219),
    (221, 214, 206),
    (210, 203, 195),
    (200, 192, 184),
    (190, 182, 174),
    (180, 172, 164),
]

def dist(c1, c2):
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(c1, c2)))

def near_bg(r, g, b, a, tol=48):
    """Cream paper + soft drop-shadow fringe around the mark (edge flood only)."""
    if a == 0:
        return False
    rgb = (r, g, b)
    avg = (r + g + b) / 3.0
    # Keep vivid logo blues / oranges out (they are highly saturated)
    sat = max(rgb) - min(rgb)
    if sat > 32:
        return False
    # Light paper through muted warm shadow
    if avg < 155:
        return False
    return any(dist(rgb, ref) <= tol for ref in BG_REFS) or (avg >= 175 and sat <= 24)

visited = [[False] * h for _ in range(w)]
q = deque()
for x in range(w):
    q.append((x, 0))
    q.append((x, h - 1))
for y in range(h):
    q.append((0, y))
    q.append((w - 1, y))

removed = 0
while q:
    x, y = q.popleft()
    if x < 0 or y < 0 or x >= w or y >= h or visited[x][y]:
        continue
    visited[x][y] = True
    r, g, b, a = px[x, y]
    if not near_bg(r, g, b, a):
        continue
    px[x, y] = (0, 0, 0, 0)
    removed += 1
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        q.append((x + dx, y + dy))

print(f"pass1 removed {removed}")

# Second pass: despill residual light fringe next to transparent pixels
# (anti-aliased cream mixed into logo edge). Only knock down alpha on
# near-paper pixels that touch transparency — do not invent new colors.
def is_paperish(r, g, b):
    avg = (r + g + b) / 3.0
    sat = max(r, g, b) - min(r, g, b)
    return avg >= 170 and sat <= 30

changed = 0
for y in range(h):
    for x in range(w):
        r, g, b, a = px[x, y]
        if a == 0 or not is_paperish(r, g, b):
            continue
        touch = False
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and px[nx, ny][3] == 0:
                touch = True
                break
        if touch:
            px[x, y] = (0, 0, 0, 0)
            changed += 1
print(f"pass2 fringe removed {changed}")

bbox = src.getbbox()
if not bbox:
    raise SystemExit("bbox empty")
src = src.crop(bbox)
pad = 4
canvas = Image.new("RGBA", (src.width + pad * 2, src.height + pad * 2), (0, 0, 0, 0))
canvas.paste(src, (pad, pad), src)
src = canvas

for p in (r"src/assets/logo.png", r"public/logo.png", r"landing/assets/logo.png"):
    src.save(p, "PNG", optimize=True)
    print(f"saved {p} {src.size[0]}x{src.size[1]}")
