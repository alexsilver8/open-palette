import { useEffect, useRef } from 'react';
import type { DisplayItem, DisplaySection } from '../model';
import { Highlight } from './Highlight';
import { ItemIcon, tintOf } from './ItemIcon';

interface ResultListProps {
  sections: DisplaySection[];
  selectedId: string | undefined;
  emptyText: string | undefined;
  onSelect(item: DisplayItem): void;
  onActivate(item: DisplayItem): void;
}

export const optionId = (index: number) => `option-${index}`;

function Row({ item }: { item: DisplayItem }) {
  if (item.calculator) {
    return (
      <span className="calc">
        <span className="calc__expression">{item.calculator.expression}</span>
        <span className="calc__equals" aria-hidden="true">
          =
        </span>
        <span className="calc__result">{item.calculator.result}</span>
      </span>
    );
  }
  return (
    <>
      <ItemIcon icon={item.icon} />
      <span className="row__text">
        <span className="row__title">
          <Highlight text={item.title} positions={item.titlePositions} />
        </span>
        {item.subtitle && <span className="row__subtitle">{item.subtitle}</span>}
      </span>
      {item.accessory && <span className="row__accessory">{item.accessory}</span>}
    </>
  );
}

export function ResultList({ sections, selectedId, emptyText, onSelect, onActivate }: ResultListProps) {
  const rows = useRef(new Map<string, HTMLLIElement>());

  useEffect(() => {
    if (selectedId) rows.current.get(selectedId)?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  if (sections.every((section) => section.items.length === 0)) {
    return <div className="empty">{emptyText}</div>;
  }

  let index = -1;
  return (
    <div className="results" id="results" role="listbox" aria-label="Results">
      {sections.map((section, sectionIndex) => (
        <section key={sectionIndex} className="results__section" aria-label={section.title}>
          {section.title && <h2 className="results__heading">{section.title}</h2>}
          <ul>
            {section.items.map((item) => {
              index += 1;
              const selected = item.id === selectedId;
              return (
                <li
                  key={item.id}
                  id={optionId(index)}
                  ref={(node) => {
                    if (node) rows.current.set(item.id, node);
                    else rows.current.delete(item.id);
                  }}
                  role="option"
                  aria-selected={selected}
                  className={item.calculator ? 'row row--calc' : 'row'}
                  data-tint={tintOf(item.icon)}
                  onMouseMove={() => {
                    if (!selected) onSelect(item);
                  }}
                  onClick={() => onActivate(item)}
                >
                  <Row item={item} />
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
