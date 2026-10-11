// Temporary: draws the icon Finder shows for a file into a PNG of the given size.
ObjC.import('AppKit');
function run(argv) {
  const [path, out, size] = argv;
  const px = Number(size);
  const image = $.NSWorkspace.sharedWorkspace.iconForFile(path);
  const rep = $.NSBitmapImageRep.alloc.initWithBitmapDataPlanesPixelsWidePixelsHighBitsPerSampleSamplesPerPixelHasAlphaIsPlanarColorSpaceNameBytesPerRowBitsPerPixel(
    null, px, px, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0);
  $.NSGraphicsContext.saveGraphicsState;
  $.NSGraphicsContext.currentContext = $.NSGraphicsContext.graphicsContextWithBitmapImageRep(rep);
  image.drawInRectFromRectOperationFraction($.NSMakeRect(0, 0, px, px), $.NSZeroRect, $.NSCompositingOperationCopy, 1.0);
  $.NSGraphicsContext.restoreGraphicsState;
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $()).writeToFileAtomically(out, true);
}
