export function AuthBrand() {
  return (
    <div className="brand" aria-label="IP Motors Fleet Manager">
      <span className="brand-mark-frame">
        {/* The canonical brand asset is served by the Fleet PWA. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          className="brand-mark"
          src="https://fleet-manager.ip-motors-fleet.workers.dev/ip-motors-mark.webp"
          alt="IP Motors"
          width="76"
          height="48"
        />
      </span>
      <span className="brand-copy">
        <strong>IP Motors</strong>
        <span>Fleet Manager</span>
      </span>
    </div>
  );
}
