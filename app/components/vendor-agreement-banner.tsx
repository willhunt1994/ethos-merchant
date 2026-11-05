import type { VendorAgreementView } from "../lib/vendor-agreement.server";

export function VendorAgreementBanner({
  agreement,
  context,
}: {
  agreement: VendorAgreementView;
  context: "submit" | "payout" | "app";
}) {
  const vendorReady =
    agreement.isSigned && agreement.isCurrentVersion && agreement.scheduleAComplete;

  if (context === "app") {
    if (vendorReady) return null;
    if (!agreement.isSigned || !agreement.isCurrentVersion) {
      return (
        <s-banner tone="warning" heading="Vendor Agreement Required">
          Review and accept the vendor agreement in{" "}
          <s-link href="/app/settings?section=vendor-agreement">Settings → Vendor Agreement</s-link>{" "}
          to submit products and enable payouts.
        </s-banner>
      );
    }
    return (
      <s-banner tone="warning" heading="Schedule A Incomplete">
        Accept Schedule A in{" "}
        <s-link href="/app/settings?section=vendor-agreement">Settings → Vendor Agreement</s-link>{" "}
        to finish onboarding.
      </s-banner>
    );
  }

  if (context === "submit") {
    if (vendorReady) return null;
    if (!agreement.isSigned || !agreement.isCurrentVersion) {
      return (
        <s-banner tone="warning" heading="Vendor Agreement Required">
          Accept the vendor agreement and complete Schedule A in{" "}
          <s-link href="/app/settings?section=vendor-agreement">Settings → Vendor Agreement</s-link>{" "}
          before submitting products to Ethos.
        </s-banner>
      );
    }
    return (
      <s-banner tone="warning" heading="Schedule A Incomplete">
        Fill in the required Schedule A commercial terms in{" "}
        <s-link href="/app/settings?section=vendor-agreement">Settings → Vendor Agreement</s-link>{" "}
        before submitting products.
      </s-banner>
    );
  }

  if (agreement.fullyExecuted) return null;

  if (!vendorReady) {
    return (
      <s-banner tone="warning" heading="Vendor Agreement Required">
        Complete and accept the vendor agreement in{" "}
        <s-link href="/app/settings?section=vendor-agreement">Settings → Vendor Agreement</s-link>{" "}
        before connecting a payout bank account.
      </s-banner>
    );
  }

  return (
    <s-banner tone="warning" heading="Vendor Agreement Pending Ethos Acceptance">
      You have signed the vendor agreement. Payout setup unlocks after Ethos countersigns. Your
      representative can complete this from the Ethos admin integration API.
    </s-banner>
  );
}
