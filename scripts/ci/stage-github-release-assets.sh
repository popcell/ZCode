#!/usr/bin/env bash
# 把 Actions artifact 摊平为 GitHub Release 附件：只保留 ZCode- 前缀。
set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "usage: stage-github-release-assets.sh <source-dir> <dest-dir> <version>" >&2
  exit 1
fi

source_dir=$1
dest_dir=$2
version=$3
cli_tarball="zcode-${version}.tar.gz"
release_cli_tarball="ZCode-${version}-cli.tar.gz"
release_cli_sha="ZCode-${version}-cli.sha256.txt"

mkdir -p "${dest_dir}"
shopt -s nullglob
found=0

while IFS= read -r -d "" file; do
  base=$(basename "${file}")
  dest_name=""
  case "${base}" in
    "${cli_tarball}")
      dest_name="${release_cli_tarball}"
      ;;
    sha256.txt)
      dest_name="${release_cli_sha}"
      ;;
    latest.json | install.sh)
      continue
      ;;
    ZCode-*)
      dest_name="${base}"
      ;;
    *)
      continue
      ;;
  esac

  dest_path="${dest_dir}/${dest_name}"
  if [ -e "${dest_path}" ]; then
    echo "duplicate release asset: ${dest_name}" >&2
    exit 1
  fi
  cp "${file}" "${dest_path}"
  found=$((found + 1))

  if [ "${dest_name}" = "${release_cli_sha}" ]; then
    hash=$(awk '{ print $1 }' "${dest_path}")
    if [ -z "${hash}" ]; then
      echo "empty sha256.txt" >&2
      exit 1
    fi
    printf '%s  %s\n' "${hash}" "${release_cli_tarball}" >"${dest_path}"
  fi
done < <(find "${source_dir}" -type f -print0)

if [ "${found}" -eq 0 ]; then
  echo "no ZCode-* release assets found in ${source_dir}" >&2
  exit 1
fi

echo "staged ${found} GitHub Release assets into ${dest_dir}"
