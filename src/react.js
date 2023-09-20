import * as React from 'react'
import {
  elementScroll,
  observeElementOffset,
  observeElementRect,
  observeWindowOffset,
  observeWindowRect,
  Virtualizer,
  windowScroll
} from './core'
export * from './core'

const useIsomorphicLayoutEffect =
  typeof document !== "undefined" ? React.useLayoutEffect : React.useEffect

function useVirtualizerBase(options) {
  const rerender = React.useReducer(() => ({}), {})[1]

  const resolvedOptions = {
    ...options,
    onChange: instance => {
      rerender()
      options.onChange?.(instance)
    }
  }

  const [instance] = React.useState(() => new Virtualizer(resolvedOptions))

  instance.setOptions(resolvedOptions)

  React.useEffect(() => {
    return instance._didMount()
  }, [])

  useIsomorphicLayoutEffect(() => {
    return instance._willUpdate()
  })

  return instance
}

export function useVirtualizer(options) {
  return useVirtualizerBase({
    observeElementRect: observeElementRect,
    observeElementOffset: observeElementOffset,
    scrollToFn: elementScroll,
    ...options
  })
}

export function useWindowVirtualizer(options) {
  return useVirtualizerBase({
    getScrollElement: () => (typeof document !== "undefined" ? window : null),
    observeElementRect: observeWindowRect,
    observeElementOffset: observeWindowOffset,
    scrollToFn: windowScroll,
    ...options
  })
}
