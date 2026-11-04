import type { ShopSupplierLinkView } from "../lib/shop-supplier.server";

export function SupplierApprovalBanner({ supplier }: { supplier: ShopSupplierLinkView }) {
  if (supplier.canSubmit) return null;

  let message: string;
  if (supplier.approvalStatus === "none") {
    message =
      "Your store is not linked to an Ethos supplier yet. Ethos will connect your shop to your supplier account—you can configure products and uploads while you wait.";
  } else if (supplier.approvalStatus === "pending") {
    message = supplier.ethosSupplierSlug
      ? `Supplier “${supplier.ethosSupplierSlug}” is linked but awaiting Ethos approval. Submission to the catalog will unlock after approval.`
      : "Your supplier link is pending Ethos approval.";
  } else {
    message =
      "Your supplier link was not approved. Contact your Ethos representative to resolve this before submitting products.";
  }

  return (
    <div
      style={{
        background: supplier.approvalStatus === "rejected" ? "#fef2f2" : "#fffbeb",
        border: `1px solid ${supplier.approvalStatus === "rejected" ? "#fecaca" : "#fde68a"}`,
        borderRadius: "8px",
        padding: "12px 16px",
        margin: "0 0 16px",
        fontSize: "13px",
        color: supplier.approvalStatus === "rejected" ? "#991b1b" : "#92400e",
      }}
    >
      {message}
    </div>
  );
}
