import { RefObject, useLayoutEffect, useState } from "react";
import useResizeObserver from '@react-hook/resize-observer'

export function useContainerDimensions<T extends HTMLElement | null>(ref: RefObject<T>) {
  const [size, setSize] = useState<DOMRect>()

  useLayoutEffect(() => {
    setSize(ref.current?.getBoundingClientRect())
  }, [ref])

  useResizeObserver(ref, (entry) => setSize(entry.contentRect))
  return size
}
