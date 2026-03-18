declare module "qrcode" {
  export type QRCodeToDataURLOptions = {
    width?: number;
    margin?: number;
    color?: {
      dark?: string;
      light?: string;
    };
  };

  export type QRCodeModule = {
    toDataURL(text: string, options?: QRCodeToDataURLOptions): Promise<string>;
  };

  const QRCode: QRCodeModule;
  export default QRCode;
}
