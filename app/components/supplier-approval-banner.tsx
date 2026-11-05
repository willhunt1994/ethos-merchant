import type { ShopSupplierLinkView } from "../lib/shop-supplier.server";

export function SupplierApprovalBanner({ supplier }: { supplier: ShopSupplierLinkView }) {
  if (supplier.canSubmit) return null;

  if (supplier.approvalStatus === "none") {
    return (
      <s-banner tone="info" heading="Supplier link pending">
        Your store is not linked to an Ethos supplier yet. You can browse, select, and configure products
        while Ethos connects your shop.
      </s-banner>
    );
  }

  if (supplier.approvalStatus === "pending") {
    return (
      <s-banner tone="warning" heading="Awaiting Ethos approval">
        {supplier.ethosSupplierSlug
          ? `Supplier “${supplier.ethosSupplierSlug}” is linked. Submission unlocks after Ethos approves the connection.`
          : "Your supplier link is pending Ethos approval. You can configure pricing and uploads in the meantime."}
      </s-banner>
    );
  }

  return (
    <s-banner tone="critical" heading="Supplier link not approved">
      Contact your Ethos representative before submitting products to the catalog.
    </s-banner>
  );
}
