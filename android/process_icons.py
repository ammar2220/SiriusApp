from PIL import Image
import os

source_path = 'C:/SiriusApp/branding/option1.jpg'
output_dir = 'C:/SiriusApp/android/app/src/main/res'

# Density map for legacy icons
densities = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

# Load image
img = Image.open(source_path).convert('RGBA')
original_size = img.size

# 1. Generate Adaptive Foreground
# Canvas size 512x512, logo scaled to ~60% (307px)
canvas_size = 512
safe_zone_size = int(canvas_size * 0.6)
foreground = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))

# Resize original image to fit safe zone while preserving aspect ratio
aspect_ratio = original_size[0] / original_size[1]
if aspect_ratio > 1:
    w = safe_zone_size
    h = int(safe_zone_size / aspect_ratio)
else:
    h = safe_zone_size
    w = int(safe_zone_size * aspect_ratio)

resized_logo = img.resize((w, h), Image.Resampling.LANCZOS)
offset = ((canvas_size - w) // 2, (canvas_size - h) // 2)
foreground.paste(resized_logo, offset, resized_logo)

# Ensure the directory for foreground exists
foreground_dir = os.path.join(output_dir, 'drawable')
os.makedirs(foreground_dir, exist_ok=True)
foreground.save(os.path.join(foreground_dir, 'ic_launcher_foreground.png'))

# 2. Generate Legacy Icons (ic_launcher and ic_launcher_round)
for folder, size in densities.items():
    # Create folder
    path = os.path.join(output_dir, folder)
    os.makedirs(path, exist_ok=True)
    
    # Resize original image for legacy icon
    # We'll use a simple resize for legacy since they are usually full-bleed
    legacy_icon = img.resize((size, size), Image.Resampling.LANCZOS)
    
    legacy_icon.save(os.path.join(path, 'ic_launcher.png'))
    legacy_icon.save(os.path.join(path, 'ic_launcher_round.png'))

print("Icons generated successfully.")
