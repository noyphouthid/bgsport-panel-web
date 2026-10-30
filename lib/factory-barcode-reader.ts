import { BarcodeFormat, DecodeHintType } from "@zxing/library";

export function getFactoryBarcodeHints() {
  return new Map<DecodeHintType, unknown>([
    // Deliberately exclude QR: the factory sheet has a QR beside the barcode.
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.ITF, BarcodeFormat.CODABAR]],
    [DecodeHintType.TRY_HARDER, true],
  ]);
}
