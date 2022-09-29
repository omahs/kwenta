import { BigNumber } from '@ethersproject/bignumber';
import { ContractsMap, NetworkId } from '@synthetixio/contracts-interface';
import Wei, { wei } from '@synthetixio/wei';
import { utils } from 'ethers';
import { chain } from 'wagmi';

import { ETH_UNIT } from 'constants/network';
import { MarketClosureReason } from 'hooks/useMarketClosed';
import { SynthsTrades, SynthsVolumes } from 'queries/synths/type';
import { formatDollars, weiFromWei, zeroBN } from 'utils/formatters/number';
import { FuturesMarketAsset } from 'utils/futures';

import { SECONDS_PER_DAY, FUTURES_ENDPOINTS } from './constants';
import {
	FuturesHourlyStatResult,
	FuturesMarginTransferResult,
	FuturesPositionResult,
	FuturesTradeResult,
} from './subgraph';
import {
	FuturesPosition,
	FuturesOpenInterest,
	FuturesOneMinuteStat,
	PositionDetail,
	PositionSide,
	FuturesVolumes,
	PositionHistory,
	FundingRateUpdate,
	FuturesTrade,
	MarginTransfer,
} from './types';

export const getFuturesEndpoint = (networkId: NetworkId): string => {
	return FUTURES_ENDPOINTS[networkId] || FUTURES_ENDPOINTS[chain.optimism.id];
};

export const getFuturesMarketContract = (asset: string | null, contracts: ContractsMap) => {
	if (!asset) throw new Error(`Asset needs to be specified`);
	const contractName = `FuturesMarket${asset[0] === 's' ? asset.substring(1) : asset}`;
	const contract = contracts[contractName];
	if (!contract) throw new Error(`${contractName} for ${asset} does not exist`);
	return contract;
};

export const mapFuturesPosition = (
	positionDetail: PositionDetail,
	canLiquidatePosition: boolean,
	asset: FuturesMarketAsset
): FuturesPosition => {
	const {
		remainingMargin,
		accessibleMargin,
		orderPending,
		order,
		position: { fundingIndex, lastPrice, size, margin },
		accruedFunding,
		notionalValue,
		liquidationPrice,
		profitLoss,
	} = positionDetail;
	const initialMargin = wei(margin);
	const pnl = wei(profitLoss).add(wei(accruedFunding));
	const pnlPct = initialMargin.gt(0) ? pnl.div(wei(initialMargin)) : wei(0);
	return {
		asset,
		order: !!orderPending
			? {
					pending: !!orderPending,
					fee: wei(order.fee),
					leverage: wei(order.leverage),
					side: wei(order.leverage).gte(zeroBN) ? PositionSide.LONG : PositionSide.SHORT,
			  }
			: null,
		remainingMargin: wei(remainingMargin),
		accessibleMargin: wei(accessibleMargin),
		position: wei(size).eq(zeroBN)
			? null
			: {
					canLiquidatePosition: !!canLiquidatePosition,
					side: wei(size).gt(zeroBN) ? PositionSide.LONG : PositionSide.SHORT,
					notionalValue: wei(notionalValue).abs(),
					accruedFunding: wei(accruedFunding),
					initialMargin,
					profitLoss: wei(profitLoss),
					fundingIndex: Number(fundingIndex),
					lastPrice: wei(lastPrice),
					size: wei(size).abs(),
					liquidationPrice: wei(liquidationPrice),
					initialLeverage: initialMargin.gt(0)
						? wei(size).mul(wei(lastPrice)).div(initialMargin).abs()
						: wei(0),
					pnl,
					pnlPct,
					marginRatio: wei(notionalValue).eq(zeroBN)
						? zeroBN
						: wei(remainingMargin).div(wei(notionalValue).abs()),
					leverage: wei(remainingMargin).eq(zeroBN)
						? zeroBN
						: wei(notionalValue).div(wei(remainingMargin)).abs(),
			  },
	};
};

type MarketSizes = {
	short: BigNumber;
	long: BigNumber;
};

export const mapOpenInterest = async (
	keys: string[],
	contracts: ContractsMap
): Promise<FuturesOpenInterest[]> => {
	const openInterest: FuturesOpenInterest[] = [];
	for (const key of keys) {
		const contract = contracts[`FuturesMarket${key.substr(1)}`];
		if (contract) {
			const marketSizes: MarketSizes = await contract.marketSizes();
			const shortSize = wei(marketSizes.short);
			const longSize = wei(marketSizes.long);

			if (shortSize.toNumber() === 0 && longSize.toNumber() === 0) {
				openInterest.push({
					asset: key,
					ratio: {
						long: 0.5,
						short: 0.5,
					},
				});
			} else if (shortSize.toNumber() === 0 || longSize.toNumber() === 0) {
				openInterest.push({
					asset: key,
					ratio: {
						long: shortSize.toNumber() === 0 ? 1 : 0,
						short: longSize.toNumber() === 0 ? 1 : 0,
					},
				});
			} else {
				const combined = shortSize.add(longSize);

				openInterest.push({
					asset: key,
					ratio: {
						long: longSize.div(combined).toNumber(),
						short: shortSize.div(combined).toNumber(),
					},
				});
			}
		}
	}
	return openInterest;
};

export const calculateVolumes = (futuresHourlyStats: FuturesHourlyStatResult[]): FuturesVolumes => {
	const volumes: FuturesVolumes = futuresHourlyStats.reduce(
		(acc: FuturesVolumes, { asset, volume, trades }) => {
			return {
				...acc,
				[asset]: {
					volume: volume.div(ETH_UNIT).add(acc[asset]?.volume ?? 0),
					trades: trades.add(acc[asset]?.trades ?? 0),
				},
			};
		},
		{}
	);
	return volumes;
};

export const calculateTradeVolumeForAllSynths = (SynthTrades: SynthsTrades): SynthsVolumes => {
	const result = SynthTrades.synthExchanges
		.filter((i) => i.fromSynth !== null)
		.reduce((acc: any, curr: any) => {
			if (curr.fromSynth.symbol) {
				acc[curr.fromSynth.symbol] = acc[curr.fromSynth.symbol]
					? acc[curr.fromSynth.symbol] + Number(curr.fromAmountInUSD)
					: Number(curr.fromAmountInUSD);
			}
			return acc;
		}, {});
	return result;
};

export const calculateDailyTradeStats = (futuresTrades: FuturesOneMinuteStat[]) => {
	return futuresTrades.reduce(
		(acc, stat) => {
			return {
				totalVolume: acc.totalVolume.add(stat.volume.div(ETH_UNIT).abs()),
				totalTrades: acc.totalTrades + Number(stat.trades),
			};
		},
		{
			totalTrades: 0,
			totalVolume: wei(0),
		}
	);
};

export const calculateFundingRate = (
	minTimestamp: number,
	periodLength: number,
	fundingRates: FundingRateUpdate[],
	assetPrice: Wei,
	currentFundingRate: Wei
): Wei | null => {
	const numUpdates = fundingRates.length;
	if (numUpdates < 2) return null;

	// variables to keep track
	let fundingPaid = wei(0);
	let timeTotal = 0;
	let lastTimestamp = minTimestamp;

	// iterate through funding updates
	for (let ind = 0; ind < numUpdates - 1; ind++) {
		const minFunding = fundingRates[ind];
		const maxFunding = fundingRates[ind + 1];

		const fundingStart = new Wei(minFunding.funding, 18, true);
		const fundingEnd = new Wei(maxFunding.funding, 18, true);

		const fundingDiff = fundingStart.sub(fundingEnd);
		const timeDiff = maxFunding.timestamp - Math.max(minFunding.timestamp, lastTimestamp);
		const timeMax = maxFunding.timestamp - minFunding.timestamp;

		if (timeMax > 0) {
			fundingPaid = fundingPaid.add(fundingDiff.mul(timeDiff).div(timeMax));
			timeTotal += timeDiff;
		}
		lastTimestamp = maxFunding.timestamp;
	}

	// add funding from current rate
	const timeLeft = Math.max(periodLength - timeTotal, 0);
	if (timeLeft > 0) {
		fundingPaid = fundingPaid.add(
			wei(currentFundingRate).mul(timeLeft).div(SECONDS_PER_DAY).mul(assetPrice)
		);
	}

	const fundingRate = fundingPaid.div(assetPrice);
	return fundingRate;
};

export const getReasonFromCode = (
	reasonCode?: BigNumber
): MarketClosureReason | 'unknown' | null => {
	switch (Number(reasonCode)) {
		case 1:
			return 'system-upgrade';
		case 2:
			return 'market-closure';
		case 3:
		case 55:
		case 65:
		case 231:
			return 'circuit-breaker';
		case 99999:
			return 'emergency';
		default:
			return 'unknown';
	}
};

export const mapMarginTransfers = (
	marginTransfers: FuturesMarginTransferResult[]
): MarginTransfer[] => {
	return marginTransfers?.map(
		({
			timestamp,
			account,
			market,
			size,
			asset,
			txHash,
		}: FuturesMarginTransferResult): MarginTransfer => {
			const sizeWei = new Wei(size);
			const cleanSize = sizeWei.div(ETH_UNIT).abs();
			const isPositive = sizeWei.gt(0);
			const amount = `${isPositive ? '+' : '-'}${formatDollars(cleanSize)}`;
			const numTimestamp = wei(timestamp).toNumber();

			return {
				timestamp: numTimestamp,
				account,
				market,
				size,
				action: isPositive ? 'deposit' : 'withdraw',
				amount,
				isPositive,
				asset: utils.parseBytes32String(asset) as FuturesMarketAsset,
				txHash,
			};
		}
	);
};

export const mapFuturesPositions = (
	futuresPositions: FuturesPositionResult[]
): PositionHistory[] => {
	return futuresPositions.map(
		({
			id,
			lastTxHash,
			openTimestamp,
			closeTimestamp,
			timestamp,
			market,
			asset,
			account,
			abstractAccount,
			accountType,
			isOpen,
			isLiquidated,
			trades,
			totalVolume,
			size,
			initialMargin,
			margin,
			pnl,
			feesPaid,
			netFunding,
			pnlWithFeesPaid,
			netTransfers,
			totalDeposits,
			entryPrice,
			avgEntryPrice,
			exitPrice,
		}: FuturesPositionResult) => {
			const entryPriceWei = weiFromWei(entryPrice).div(ETH_UNIT);
			const exitPriceWei = weiFromWei(exitPrice || 0).div(ETH_UNIT);
			const sizeWei = weiFromWei(size).div(ETH_UNIT);
			const feesWei = weiFromWei(feesPaid || 0).div(ETH_UNIT);
			const netFundingWei = weiFromWei(netFunding || 0).div(ETH_UNIT);
			const netTransfersWei = weiFromWei(netTransfers || 0).div(ETH_UNIT);
			const totalDepositsWei = weiFromWei(totalDeposits || 0).div(ETH_UNIT);
			const initialMarginWei = weiFromWei(initialMargin).div(ETH_UNIT);
			const marginWei = weiFromWei(margin).div(ETH_UNIT);
			const pnlWei = weiFromWei(pnl).div(ETH_UNIT);
			const pnlWithFeesPaidWei = weiFromWei(pnlWithFeesPaid).div(ETH_UNIT);
			const totalVolumeWei = weiFromWei(totalVolume).div(ETH_UNIT);
			const avgEntryPriceWei = weiFromWei(avgEntryPrice).div(ETH_UNIT);

			return {
				id: Number(id.split('-')[1].toString()),
				transactionHash: lastTxHash,
				timestamp: timestamp.mul(1000).toNumber(),
				openTimestamp: openTimestamp.mul(1000).toNumber(),
				closeTimestamp: closeTimestamp?.mul(1000).toNumber(),
				market,
				asset: utils.parseBytes32String(asset) as FuturesMarketAsset,
				account,
				abstractAccount,
				accountType,
				isOpen,
				isLiquidated,
				size: sizeWei.abs(),
				feesPaid: feesWei,
				netFunding: netFundingWei,
				netTransfers: netTransfersWei,
				totalDeposits: totalDepositsWei,
				initialMargin: initialMarginWei,
				margin: marginWei,
				entryPrice: entryPriceWei,
				exitPrice: exitPriceWei,
				pnl: pnlWei,
				pnlWithFeesPaid: pnlWithFeesPaidWei,
				totalVolume: totalVolumeWei,
				trades: trades.toNumber(),
				avgEntryPrice: avgEntryPriceWei,
				leverage: marginWei.eq(wei(0)) ? wei(0) : sizeWei.mul(entryPriceWei).div(marginWei).abs(),
				side: sizeWei.gte(wei(0)) ? PositionSide.LONG : PositionSide.SHORT,
			};
		}
	);
};

export const mapTrades = (futuresTrades: FuturesTradeResult[]): FuturesTrade[] => {
	return futuresTrades?.map(
		({
			id,
			timestamp,
			size,
			price,
			asset,
			positionSize,
			positionClosed,
			pnl,
			feesPaid,
			orderType,
		}: FuturesTradeResult) => {
			return {
				size: new Wei(size, 18, true),
				asset: asset,
				price: new Wei(price, 18, true),
				txnHash: id.split('-')[0].toString(),
				timestamp: timestamp,
				positionSize: new Wei(positionSize, 18, true),
				positionClosed,
				side: size.gt(0) ? PositionSide.LONG : PositionSide.SHORT,
				pnl: new Wei(pnl, 18, true),
				feesPaid: new Wei(feesPaid, 18, true),
				orderType: orderType,
			};
		}
	);
};
