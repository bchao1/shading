from PIL import Image


def crop_and_resize(image_path, size):
    image = Image.open(image_path)
    width, height = image.size
    if width > height:
        left = (width - height) / 2
        right = left + height
        top = 0
        bottom = height
    else:
        left = 0
        right = width
        top = (height - width) / 2
        bottom = top + width
    image = image.crop((left, top, right, bottom))
    image = image.resize((size, size), Image.ANTIALIAS)
    return image

if __name__ == "__main__":
    image = crop_and_resize("media/textures/jade.jpg", 1024)
    image.save("media/textures/jade.png")