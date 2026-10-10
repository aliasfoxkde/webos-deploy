/* Utility names compiled into vendor/coreutils.wasm (uutils coreutils,
   wasm32-wasip1, default features — `coreutils --list` at build time).
   Unix-gated utilities (chmod, df, du, env, kill, stat…) are not in this
   build; regenerating the list requires rebuilding the wasm. */
export const UTIL_NAMES = new Set([
  'arch', 'b2sum', 'base32', 'base64', 'basename', 'basenc', 'cat', 'cksum',
  'comm', 'cp', 'csplit', 'cut', 'date', 'dd', 'dir', 'dircolors', 'dirname',
  'echo', 'expand', 'expr', 'factor', 'false', 'fmt', 'fold', 'head', 'hostid',
  'join', 'link', 'ln', 'ls', 'md5sum', 'mkdir', 'mktemp', 'mv', 'nice', 'nl',
  'numfmt', 'od', 'paste', 'pathchk', 'pr', 'printenv', 'printf', 'ptx', 'pwd',
  'readlink', 'realpath', 'rm', 'rmdir', 'seq', 'sha1sum', 'sha224sum',
  'sha256sum', 'sha384sum', 'sha512sum', 'shred', 'shuf', 'sleep', 'sort',
  'split', 'sum', 'tac', 'tail', 'tee', 'test', 'touch', 'tr', 'true',
  'truncate', 'tsort', 'tty', 'uname', 'unexpand', 'uniq', 'unlink', 'vdir',
  'wc', 'yes',
]);
