import { Injectable, OnDestroy, signal, computed, effect, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ApiService } from './api.service';
import { AuthService } from './auth.service';
import { BalanceSocketService, ConsolidatedBalance, AssetBalance, ExchangeBalance } from './balance-socket.service';
import { PriceSocketService } from './price-socket.service';

export interface EnrichedAssetBalance extends AssetBalance {
  pricePair?: string;
  pricesByExchange?: { exchange: string; price: number; pair: string; change24h?: number }[];
  isAveragePrice?: boolean;
  change24h?: number;
}

export interface EnrichedConsolidatedBalance {
  byAsset: EnrichedAssetBalance[];
  byExchange: ExchangeBalance[];
  totalValueUsd: number;
  lastUpdated: Date;
  isCached?: boolean;
  isSyncing?: boolean;
}

@Injectable({
  providedIn: 'root',
})
export class ConsolidatedBalanceService implements OnDestroy {
  private destroyRef = inject(DestroyRef);

  // Internal state
  private _rawBalance = signal<ConsolidatedBalance | null>(null);
  private _loading = signal(true);
  private _error = signal('');
  private _isSyncing = signal(false);
  private _initialized = signal(false);

  // Public readonly signals
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isSyncing = this._isSyncing.asReadonly();

  // Computed enriched balance with real-time prices
  readonly balance = computed<EnrichedConsolidatedBalance | null>(() => {
    const raw = this._rawBalance();
    if (!raw) return null;

    // Trigger recalculation when prices change
    const prices = this.priceSocket.prices();

    const enrichedAssets = this.enrichAssetsWithPrices(raw.byAsset);
    const totalValueUsd = enrichedAssets.reduce((sum, a) => sum + (a.valueUsd || 0), 0);

    // Also update exchange totals based on new prices
    const enrichedExchanges = this.recalculateExchangeTotals(raw.byExchange, enrichedAssets);

    return {
      byAsset: enrichedAssets,
      byExchange: enrichedExchanges,
      totalValueUsd,
      lastUpdated: raw.lastUpdated,
      isCached: raw.isCached,
      isSyncing: raw.isSyncing,
    };
  });

  // Convenience computed signals
  readonly totalValueUsd = computed(() => this.balance()?.totalValueUsd ?? 0);
  readonly exchangeCount = computed(() => this.balance()?.byExchange?.length ?? 0);
  readonly assetCount = computed(() => this.balance()?.byAsset?.length ?? 0);
  readonly hasExchanges = computed(() => this.exchangeCount() > 0);

  // Portfolio 24h change (weighted average based on asset values)
  readonly change24h = computed(() => {
    const balance = this.balance();
    if (!balance || balance.byAsset.length === 0) return null;

    let totalCurrentValue = 0;
    let totalPreviousValue = 0;

    for (const asset of balance.byAsset) {
      const currentValue = asset.valueUsd || 0;
      const change = asset.change24h;

      if (currentValue > 0 && change !== undefined && change !== null) {
        // Calculate what the value was 24h ago
        // currentValue = previousValue * (1 + change/100)
        // previousValue = currentValue / (1 + change/100)
        const previousValue = currentValue / (1 + change / 100);
        totalCurrentValue += currentValue;
        totalPreviousValue += previousValue;
      } else if (currentValue > 0) {
        // No change data, assume 0% change
        totalCurrentValue += currentValue;
        totalPreviousValue += currentValue;
      }
    }

    if (totalPreviousValue === 0) return null;

    // Calculate overall percentage change
    const overallChange = ((totalCurrentValue - totalPreviousValue) / totalPreviousValue) * 100;
    return overallChange;
  });

  // Change in USD value (not percentage)
  readonly changeUsd24h = computed(() => {
    const balance = this.balance();
    const changePercent = this.change24h();
    if (!balance || changePercent === null) return null;

    const currentValue = balance.totalValueUsd;
    const previousValue = currentValue / (1 + changePercent / 100);
    return currentValue - previousValue;
  });

  constructor(
    private api: ApiService,
    private authService: AuthService,
    private balanceSocket: BalanceSocketService,
    private priceSocket: PriceSocketService
  ) {
    // Listen to balance socket updates
    this.balanceSocket.balanceUpdated$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((updatedBalance) => {
        console.log('[ConsolidatedBalanceService] Balance updated from socket');
        this._rawBalance.set(updatedBalance);
        this._isSyncing.set(false);
      });
  }

  /**
   * Initialize the service - connect sockets and load initial data
   * Should be called once when user is authenticated
   */
  initialize(): void {
    if (this._initialized()) return;

    const userId = this.authService.user()?.id;
    if (!userId) {
      console.warn('[ConsolidatedBalanceService] No user ID available');
      return;
    }

    console.log('[ConsolidatedBalanceService] Initializing...');
    this._initialized.set(true);

    // Connect sockets
    this.balanceSocket.connect(userId);
    this.priceSocket.connect();

    // Load initial data
    this.loadBalance();
  }

  /**
   * Load/refresh balance from API
   */
  loadBalance(): void {
    this._loading.set(true);
    this._error.set('');

    this.api.get<ConsolidatedBalance>('/balances').subscribe({
      next: (data) => {
        console.log('[ConsolidatedBalanceService] Balance loaded from API');
        this._rawBalance.set({
          ...data,
          lastUpdated: new Date(data.lastUpdated),
        });
        this._loading.set(false);

        if (data.isCached) {
          this._isSyncing.set(true);
        }

        // Subscribe to price updates for all assets
        this.subscribeToAssetPrices(data.byAsset);
      },
      error: (err) => {
        console.error('[ConsolidatedBalanceService] Error loading balance:', err);
        this._error.set(err.error?.message || 'Error al cargar balances');
        this._loading.set(false);
      },
    });
  }

  /**
   * Subscribe to price updates for all assets in the balance
   */
  private subscribeToAssetPrices(assets: AssetBalance[]): void {
    const symbols = assets
      .map((a) => `${a.asset}/USDT`)
      .filter((s) => !s.startsWith('USDT/') && !s.startsWith('USD/'));

    if (symbols.length > 0) {
      console.log('[ConsolidatedBalanceService] Subscribing to prices:', symbols.length);
      this.priceSocket.subscribe(symbols);
    }
  }

  /**
   * Enrich assets with real-time prices
   */
  private enrichAssetsWithPrices(assets: AssetBalance[]): EnrichedAssetBalance[] {
    return assets.map((asset) => {
      const priceResult = this.calculateAssetPrice(asset);

      if (priceResult) {
        return {
          ...asset,
          priceUsd: priceResult.price,
          valueUsd: asset.total * priceResult.price,
          pricePair: priceResult.pair,
          pricesByExchange: priceResult.pricesByExchange,
          isAveragePrice: priceResult.isAverage,
          change24h: priceResult.change24h,
        };
      }

      return asset as EnrichedAssetBalance;
    }).sort((a, b) => (b.valueUsd || 0) - (a.valueUsd || 0));
  }

  /**
   * Calculate the price for an asset using multi-exchange logic
   */
  private calculateAssetPrice(asset: AssetBalance): {
    price: number;
    pair: string;
    pricesByExchange: { exchange: string; price: number; pair: string; change24h?: number }[];
    isAverage: boolean;
    change24h?: number;
  } | undefined {
    const multiPrice = this.priceSocket.getMultiExchangePrice(asset.asset);
    if (!multiPrice || multiPrice.prices.length === 0) {
      // Fallback: try simple price lookup
      const simplePrice = this.priceSocket.getPriceByAssetWithPair(asset.asset);
      if (simplePrice) {
        return {
          price: simplePrice.price,
          pair: simplePrice.pair,
          pricesByExchange: [],
          isAverage: false,
          change24h: undefined,
        };
      }
      return undefined;
    }

    const assetExchanges = asset.exchanges || [];

    // Case: Asset in only one exchange - use that exchange's price if available
    if (assetExchanges.length === 1) {
      const assetExchange = assetExchanges[0];
      const matchingPrice = multiPrice.prices.find((p) => p.exchange === assetExchange);

      if (matchingPrice) {
        return {
          price: matchingPrice.price,
          pair: matchingPrice.pair,
          pricesByExchange: [matchingPrice],
          isAverage: false,
          change24h: matchingPrice.change24h,
        };
      }
    }

    // Case: Asset in multiple exchanges or no specific price - use average
    return {
      price: multiPrice.averagePrice,
      pair: multiPrice.pair,
      pricesByExchange: multiPrice.prices,
      isAverage: multiPrice.prices.length > 1,
      change24h: multiPrice.change24h,
    };
  }

  /**
   * Recalculate exchange totals based on enriched asset prices
   */
  private recalculateExchangeTotals(
    exchanges: ExchangeBalance[],
    enrichedAssets: EnrichedAssetBalance[]
  ): ExchangeBalance[] {
    return exchanges.map((exchange) => {
      let newTotal = 0;

      for (const asset of enrichedAssets) {
        const breakdown = asset.exchangeBreakdown?.find((b) => b.exchange === exchange.exchange);
        if (breakdown && asset.priceUsd) {
          newTotal += breakdown.total * asset.priceUsd;
        }
      }

      return {
        ...exchange,
        totalValueUsd: newTotal || exchange.totalValueUsd,
      };
    }).sort((a, b) => b.totalValueUsd - a.totalValueUsd);
  }

  /**
   * Disconnect sockets and cleanup
   */
  disconnect(): void {
    this.balanceSocket.disconnect();
    this.priceSocket.disconnect();
    this._initialized.set(false);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }
}
