/* wosh path presentation helpers. The Files-app disk is the shell's
   filesystem and its '/Home' directory is home: the prompt shows '~', and
   '~'-prefixed command arguments expand before path resolution. */

export const HOME = '/Home';

/* '/Home/docs' → '~/docs'; anything outside home prints as-is. */
export const tilde = (p) => (p === HOME || p.startsWith(`${HOME}/`) ? `~${p.slice(HOME.length)}` : p);

/* '~' → '/Home', '~/x' → '/Home/x'; other input passes through untouched. */
export const expandTilde = (p) => (p === '~' ? HOME : p.startsWith('~/') ? HOME + p.slice(1) : p);
