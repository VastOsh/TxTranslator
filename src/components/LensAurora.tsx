// Ambient "spectrum aurora" for the tool pages: soft blurred blobs of the
// Renzu lens-coating colours (teal / violet / amber / rose) drifting slowly
// behind the content, so the near-black hero reads as alive rather than empty.
// Pure CSS + a fixed, pointer-events-free layer that sits behind everything.
export default function LensAurora() {
  return (
    <div className="lens-aurora" aria-hidden="true">
      <span className="lens-aurora__blob b1" />
      <span className="lens-aurora__blob b2" />
      <span className="lens-aurora__blob b3" />
      <span className="lens-aurora__blob b4" />
      <span className="lens-aurora__grain" />
    </div>
  );
}
