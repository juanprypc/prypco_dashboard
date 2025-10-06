import Image from 'next/image';
import React from 'react';
import { formatNumber } from '@/lib/format';

export type CatalogueUnitAllocation = {
  id: string;
  unitType: string | null;
  maxStock: number | null;
  points: number | null;
  pictureUrl: string | null;
  priceAed: number | null;
};

export type CatalogueDisplayItem = {
  id: string;
  name: string;
  priceAED: number | null;
  points: number | null;
  imageUrl?: string | null;
  link?: string | null;
  termsActive?: boolean;
  termsText?: string | null;
  termsVersion?: string | null;
  termsUrl?: string | null;
  termsSignature?: string | null;
  unitAllocations: CatalogueUnitAllocation[];
};

type Props = {
  items: CatalogueDisplayItem[];
  onRedeem?: (item: CatalogueDisplayItem) => void;
  onImageError?: (item: CatalogueDisplayItem) => void;
  onShowTerms?: (item: CatalogueDisplayItem) => void;
};

function getPoints(value: number | null): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '0';
  return formatNumber(Math.round(value));
}

export function CatalogueGrid({ items, onRedeem, onImageError, onShowTerms }: Props) {
  if (!items.length) {
    return (
      <div className="rounded-[39px] border border-dashed border-[var(--color-electric-purple)] bg-white px-8 py-14 text-center text-sm text-[var(--color-outer-space)]">
        Catalogue is currently empty.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 xl:gap-8">
      {items.map((item) => {
        const imageUrl = item.imageUrl;
        return (
          <div
            key={item.id}
            className="mx-auto flex h-full w-full max-w-[170px] flex-col rounded-[18px] bg-white px-3 pb-4 pt-4 text-center shadow-[0_18px_45px_-40px_rgba(13,9,59,0.35)] sm:mx-0 sm:h-[520px] sm:max-w-none sm:px-6 sm:pt-10 sm:pb-10 sm:text-left"
          >
            <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-[0.18em] text-[var(--color-outer-space)] leading-[1.15] sm:text-[18px]">
              <span>{getPoints(item.points)} points</span>
              {item.termsActive ? (
                <button
                  type="button"
                  onClick={() => onShowTerms?.(item)}
                  className="whitespace-nowrap px-1.5 py-0.5 text-[7px] font-semibold tracking-[0.2em] text-[var(--color-electric-purple)] transition hover:text-[var(--color-outer-space)] hover:underline sm:px-2 sm:text-[10px]"
                >
                  Terms apply
                </button>
              ) : null}
            </div>

            <div className="relative mt-3 flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-[18px] bg-[#F6F3F8] sm:mt-6 sm:aspect-auto sm:h-[260px] sm:rounded-[28px]">
              {imageUrl ? (
                <Image
                  src={imageUrl}
                  alt={item.name}
                  fill
                  sizes="(max-width: 768px) 30vw, 380px"
                  className="object-contain"
                  onError={() => onImageError?.(item)}
                />
              ) : (
                <span className="text-base text-[var(--color-outer-space)]/50">Image coming soon</span>
              )}
            </div>

            <div className="mt-4 flex flex-1 flex-col justify-between sm:mt-8">
              <h3 className="text-[13px] font-semibold leading-[1.2] text-[var(--color-outer-space)] sm:text-[32px] sm:text-left">
                {item.name}
              </h3>
              {item.unitAllocations.length > 0 ? (
                <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-[var(--color-outer-space)]/60 sm:text-xs">
                  {item.unitAllocations.length} property option{item.unitAllocations.length === 1 ? '' : 's'} available
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => onRedeem?.(item)}
                disabled={!onRedeem}
                className="mt-4 inline-flex h-[34px] w-full items-center justify-center rounded-[18px] border border-[var(--color-outer-space)] bg-white/80 text-[11px] font-medium text-[var(--color-outer-space)] transition hover:border-[var(--color-electric-purple)] hover:bg-[var(--color-electric-purple)] hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:border-[var(--color-outer-space)]/30 disabled:text-[var(--color-outer-space)]/40 sm:mt-8 sm:h-[50px] sm:rounded-[24px] sm:border-2 sm:text-[16px]"
              >
                Redeem
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
