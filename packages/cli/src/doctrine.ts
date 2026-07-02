// Back-compat shim (the ADR-0112 pattern): the doctrine-pointer renderer moved to
// `@storytree/drive` so the drive-resident library dashboard (and the desktop orientation runner
// behind it) can source envelope doctrine without importing the command hub.
export { renderDoctrine, renderDoctrines } from "@storytree/drive";
