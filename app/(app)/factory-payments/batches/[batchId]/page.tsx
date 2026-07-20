import { FactoryPaymentBatchDetailPage } from "./page-client";

type FactoryPaymentBatchDetailRouteProps = {
  params: Promise<{
    batchId: string;
  }>;
};

export default async function FactoryPaymentBatchDetailRoute({ params }: FactoryPaymentBatchDetailRouteProps) {
  const { batchId } = await params;
  return <FactoryPaymentBatchDetailPage batchId={batchId} />;
}
