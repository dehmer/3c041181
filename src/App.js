import * as React from 'react'
import { faker } from '@faker-js/faker'
import { useVirtualizer } from './react'
import './App.css'

const randomNumber = (min, max) => faker.number.int({ min, max })

const sentences = new Array(2000)
  .fill(true)
  .map(() => faker.lorem.sentence(randomNumber(20, 70)))

function RowVirtualizerDynamic() {
  const parentRef = React.useRef(null)
  const count = sentences.length
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45
  })

  const items = virtualizer.getVirtualItems()
  const scrollOptions = { align: "auto" }

  return (
    <div>
      <button onClick={() => virtualizer.scrollToIndex(0, scrollOptions)}>
        scroll to the top
      </button>
      <span style={{ padding: '0 4px' }} />
      <button onClick={() => virtualizer.scrollToIndex(count / 2, scrollOptions)}>
        scroll to the middle
      </button>
      <span style={{ padding: '0 4px' }} />
      <button onClick={() => virtualizer.scrollToIndex(count - 1, scrollOptions)}>
        scroll to the end
      </button>
      <hr />
      <div
        ref={parentRef}
        className='scroll-element'
      >
        <div
          style={{
            height: virtualizer.getTotalSize(),
            width: '100%',
            position: 'relative'
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${items[0].start}px)`
            }}
          >
            {items.map(virtualRow => (
              <div
                // key: defaults to item index
                // data-index: used to communicate between dom nodes and resize observer
                // ref: measurement function; registers resize observer per element
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={
                  virtualRow.index % 2 ? 'list-item__odd' : 'list-item__even'
                }
              >
                <b>Row {virtualRow.index}</b>: {sentences[virtualRow.index]}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RowVirtualizerDynamic
