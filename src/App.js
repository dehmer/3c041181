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

  return (
    <div>
      <div
        ref={parentRef}
        className='List'
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
