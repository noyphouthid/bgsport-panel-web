import { QueueDetailPage } from "../../_components/queue-detail-page";

type FactoryProductionQueueReadyForPrintPageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function FactoryProductionQueueReadyForPrintPage({
  params,
}: FactoryProductionQueueReadyForPrintPageProps) {
  const { id } = await params;
  return <QueueDetailPage queueId={id} detailMode="ready_for_print" />;
}
