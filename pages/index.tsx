import { FC } from 'react';
import Head from 'next/head';
import { useTranslation } from 'react-i18next';

import styled from 'styled-components';
import WithHomepageContainers from 'sections/homepage/containers';
import Hero from 'sections/homepage/Hero';
import HomeLayout from 'sections/shared/Layout/HomeLayout';
import Features from 'sections/homepage/Features';
import ShortList from 'sections/homepage/ShortList';
import Earning from 'sections/homepage/Earning';
import Learn from 'sections/homepage/Learn';
import TradeNow from 'sections/homepage/TradeNow';
import dynamic from 'next/dynamic';

type AppLayoutProps = {
	children: React.ReactNode;
};

type HomePageComponent = FC & { layout?: FC<AppLayoutProps> };

const HomePage: HomePageComponent = () => {
	const { t } = useTranslation();
	const Assets = dynamic(() => import('../sections/homepage/Assets'), {
		ssr: false,
	});

	return (
		<>
			<Head>
				<title>{t('homepage.page-title')}</title>
			</Head>
			<WithHomepageContainers>
				<HomeLayout>
					<DarkContainer>
						<Container>
							<Hero />
							<Assets />
							<ShortList />
							<Earning />
							<Features />
							<Learn />
							<TradeNow />
						</Container>
					</DarkContainer>
				</HomeLayout>
			</WithHomepageContainers>
		</>
	);
};

export const Container = styled.div`
	max-width: 1200px;
	width: 100%;
	margin: 0 auto;
`;

const DarkContainer = styled.div`
	width: 100%;
	padding: 100px 20px 0 20px;
`;

export default HomePage;
