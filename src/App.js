import * as React from 'react'
import { faker } from '@faker-js/faker'
import { useVirtualizer } from './react'

const randomNumber = (min, max) => faker.datatype.number({ min, max })

const sentences = new Array(10000)
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

  return (
    <div>
      <div
        ref={parentRef}
        className='List'
        style={{
          height: 400,
          width: 400,
          overflowY: 'auto',
          contain: 'strict'
        }}
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
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className={
                  virtualRow.index % 2 ? 'ListItemOdd' : 'ListItemEven'
                }
              >
                <div style={{ padding: '10px 0' }}>
                  <div>Row {virtualRow.index}</div>
                  <div>{sentences[virtualRow.index]}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default RowVirtualizerDynamic
