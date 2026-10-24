/**
 * A 44px touch target that costs no room, on a phone: the control keeps its
 * size and takes taps out to 44px each way through an invisible ::after
 * centred on it (no further where it's already bigger), so a fingertip that
 * lands beside a 32px button still presses it. A text field can't carry
 * one: the search keeps its 36px, the height of iOS's own search field.
 * e2e/phone.spec.ts probes the controls for it.
 */
export const tapTargetClass =
  "max-sm:relative max-sm:after:absolute max-sm:after:inset-[min(0px,calc(50%-22px))] max-sm:after:content-['']";
