import { FC, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRecoilValue } from 'recoil';

import ArrowsIcon from 'assets/svg/app/circle-arrows.svg';
import Button from 'components/Button';
import Connector from 'containers/Connector';
import { useExchangeContext } from 'contexts/ExchangeContext';
import useApproveExchange from 'hooks/useApproveExchange';
import useIsL2 from 'hooks/useIsL2';
import useMarketClosed from 'hooks/useMarketClosed';
import useRedeem from 'hooks/useRedeem';
import RedeemTxModal from 'sections/dashboard/Deprecated/RedeemTxModal';
import ConnectWalletCard from 'sections/exchange/FooterCard/ConnectWalletCard';
import MarketClosureCard from 'sections/exchange/FooterCard/MarketClosureCard';
import NoSynthsCard from 'sections/exchange/FooterCard/NoSynthsCard';
import TradeSummaryCard from 'sections/exchange/FooterCard/TradeSummaryCard';
import TxApproveModal from 'sections/shared/modals/TxApproveModal';
import TxConfirmationModal from 'sections/shared/modals/TxConfirmationModal';
import {
	baseCurrencyAmountState,
	baseCurrencyKeyState,
	quoteCurrencyAmountState,
	quoteCurrencyKeyState,
	txErrorState,
} from 'store/exchange';
import { NoTextTransform } from 'styles/common';

import SettleTransactionsCard from '../../FooterCard/SettleTransactionsCard';

const FooterCard: FC = memo(() => {
	const { t } = useTranslation();
	const { isWalletConnected } = Connector.useContainer();
	const isL2 = useIsL2();

	const quoteCurrencyKey = useRecoilValue(quoteCurrencyKeyState);
	const baseCurrencyKey = useRecoilValue(baseCurrencyKeyState);
	const quoteCurrencyAmount = useRecoilValue(quoteCurrencyAmountState);
	const baseCurrencyAmount = useRecoilValue(baseCurrencyAmountState);
	const txError = useRecoilValue(txErrorState);

	const quoteCurrencyMarketClosed = useMarketClosed(quoteCurrencyKey);
	const baseCurrencyMarketClosed = useMarketClosed(baseCurrencyKey);

	const {
		noSynths,
		numEntries,
		showNoSynthsCard,
		baseFeeRate,
		needsApproval,
		handleSubmit,
		balances,
		txProvider,
		openModal,
		transactionFee,
		totalUSDBalance,
		setOpenModal,
		handleDismiss,
		feeCost,
		exchangeFeeRate,
		estimatedBaseTradePrice,
		submissionDisabledReason,
		feeReclaimPeriodInSeconds,
	} = useExchangeContext();

	const { handleApprove, isApproved } = useApproveExchange();
	const { handleRedeem } = useRedeem();

	return (
		<>
			{!isWalletConnected ? (
				<ConnectWalletCard />
			) : baseCurrencyMarketClosed.isMarketClosed || quoteCurrencyMarketClosed.isMarketClosed ? (
				<MarketClosureCard />
			) : showNoSynthsCard && noSynths ? (
				<NoSynthsCard />
			) : !isL2 && numEntries >= 12 ? (
				<SettleTransactionsCard numEntries={numEntries} />
			) : (
				<TradeSummaryCard
					submissionDisabledReason={submissionDisabledReason}
					onSubmit={needsApproval ? (isApproved ? handleSubmit : handleApprove) : handleSubmit}
					feeReclaimPeriodInSeconds={feeReclaimPeriodInSeconds}
					quoteCurrencyKey={quoteCurrencyKey}
					totalFeeRate={exchangeFeeRate}
					baseFeeRate={baseFeeRate}
					transactionFee={transactionFee}
					feeCost={feeCost}
					showFee={txProvider === 'synthetix'}
					isApproved={needsApproval ? isApproved : undefined}
				/>
			)}
			{balances.length !== 0 && totalUSDBalance.gt(0) && (
				<Button
					variant="primary"
					disabled={false}
					onClick={handleRedeem}
					size="lg"
					data-testid="submit-order"
					fullWidth
				>
					{t('dashboard.deprecated.button.redeem-synths')}
				</Button>
			)}
			{openModal === 'redeem' && (
				<RedeemTxModal
					{...{ txError, balances, totalUSDBalance }}
					onDismiss={handleDismiss}
					attemptRetry={handleRedeem}
				/>
			)}
			{openModal === 'confirm' && (
				<TxConfirmationModal
					onDismiss={() => setOpenModal(undefined)}
					txError={txError}
					attemptRetry={handleSubmit}
					baseCurrencyAmount={baseCurrencyAmount}
					quoteCurrencyAmount={quoteCurrencyAmount}
					feeCost={txProvider === 'synthetix' ? feeCost : null}
					baseCurrencyKey={baseCurrencyKey!}
					quoteCurrencyKey={quoteCurrencyKey!}
					totalTradePrice={estimatedBaseTradePrice.toString()}
					txProvider={txProvider}
					quoteCurrencyLabel={t('exchange.common.from')}
					baseCurrencyLabel={t('exchange.common.into')}
					icon={<ArrowsIcon />}
				/>
			)}
			{openModal === 'approve' && (
				<TxApproveModal
					onDismiss={() => setOpenModal(undefined)}
					txError={txError}
					attemptRetry={handleApprove}
					currencyKey={quoteCurrencyKey!}
					currencyLabel={<NoTextTransform>{quoteCurrencyKey}</NoTextTransform>}
				/>
			)}
		</>
	);
});

export default FooterCard;
