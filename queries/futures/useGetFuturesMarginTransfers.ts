import { NetworkId } from '@synthetixio/contracts-interface';
import request, { gql } from 'graphql-request';
import { useQuery, UseQueryOptions } from 'react-query';
import { useRecoilValue } from 'recoil';

import QUERY_KEYS from 'constants/queryKeys';
import Connector from 'containers/Connector';
import useIsL2 from 'hooks/useIsL2';
import { selectedFuturesAddressState } from 'store/futures';
import { getDisplayAsset } from 'utils/futures';
import logError from 'utils/logError';

import { MarginTransfer } from './types';
import { getFuturesEndpoint, mapMarginTransfers } from './utils';

const useGetFuturesMarginTransfers = (
	currencyKey: string | null,
	options?: UseQueryOptions<MarginTransfer[]>
) => {
	const selectedFuturesAddress = useRecoilValue(selectedFuturesAddressState);
	const { defaultSynthetixjs: synthetixjs, network, isWalletConnected } = Connector.useContainer();
	const futuresEndpoint = getFuturesEndpoint(network?.id as NetworkId);
	const isL2 = useIsL2();

	const gqlQuery = gql`
		query userFuturesMarginTransfers($market: String!, $walletAddress: String!) {
			futuresMarginTransfers(
				where: { account: $walletAddress, market: $market }
				orderBy: timestamp
				orderDirection: desc
				first: 1000
			) {
				id
				timestamp
				account
				market
				size
				asset
				txHash
			}
		}
	`;

	return useQuery<MarginTransfer[]>(
		QUERY_KEYS.Futures.MarginTransfers(
			network?.id as NetworkId,
			selectedFuturesAddress ?? '',
			currencyKey || null
		),
		async () => {
			if (!currencyKey || !synthetixjs || !isL2 || !isWalletConnected) return [];
			const { contracts } = synthetixjs!;
			const marketAddress = contracts[`FuturesMarket${getDisplayAsset(currencyKey)}`].address;
			if (!marketAddress || !selectedFuturesAddress) return [];

			try {
				const response = await request(futuresEndpoint, gqlQuery, {
					market: marketAddress,
					walletAddress: selectedFuturesAddress,
				});

				return response ? mapMarginTransfers(response.futuresMarginTransfers) : [];
			} catch (e) {
				logError(e);
				return [];
			}
		},
		{
			enabled: !!currencyKey && !!synthetixjs && !!selectedFuturesAddress,
			...options,
		}
	);
};

export default useGetFuturesMarginTransfers;
