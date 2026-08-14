/** Installs the "@/" resolver before the trace's own imports are evaluated. */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hook.mjs", pathToFileURL(import.meta.filename));
