import { connectorsForWallets, wallet } from '@rainbow-me/rainbowkit';
import { chain, configureChains, createClient } from 'wagmi';
import { infuraProvider } from 'wagmi/providers/infura';
import { jsonRpcProvider } from 'wagmi/providers/jsonRpc';
import { publicProvider } from 'wagmi/providers/public';

import Safe from 'components/Rainbowkit/Gnosis';
import { BLAST_NETWORK_LOOKUP } from 'constants/network';

export const initRainbowkit = () => {
	const { chains, provider } = configureChains(
		[chain.mainnet, chain.optimism, chain.goerli, chain.optimismGoerli],
		[
			jsonRpcProvider({
				rpc: (chain) => ({
					http: `https://${BLAST_NETWORK_LOOKUP[chain.id]}.blastapi.io/${
						process.env.NEXT_PUBLIC_BLASTAPI_PROJECT_ID
					}`,
				}),
				stallTimeout: 5000,
				priority: 0,
			}),
			infuraProvider({
				apiKey: process.env.NEXT_PUBLIC_INFURA_PROJECT_ID,
				stallTimeout: 5000,
				priority: 1,
			}),
			publicProvider({ stallTimeout: 5000, priority: 5 }),
		]
	);

	const connectors = connectorsForWallets([
		{
			groupName: 'Popular',
			wallets: [
				wallet.metaMask({ chains }),
				wallet.rainbow({ chains }),
				wallet.coinbase({ appName: 'Kwenta', chains }),
				wallet.walletConnect({ chains }),
			],
		},
		{
			groupName: 'More',
			wallets: [
				Safe({ chains }),
				wallet.ledger({ chains }),
				wallet.brave({ chains, shimDisconnect: true }),
				wallet.trust({ chains }),
			],
		},
	]);

	const wagmiClient = createClient({
		autoConnect: false,
		connectors,
		provider,
	});

	return {
		wagmiClient,
		chains,
	};
};
