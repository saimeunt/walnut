'use client';

import { HeaderNav } from '../header';
import { Container } from '../ui/container';
import { Footer } from '../footer';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeftIcon, PlayIcon } from '@heroicons/react/24/solid';
import { useCallback, useEffect, useState } from 'react';
import {
	openSimulationPage,
	shortenHash,
	SimpleContractCall,
	SimulationPayload
} from '@/lib/utils';
import { Chain, NetworksSelect } from '@/components/networks-select';
import { Textarea } from '../ui/textarea';
import { fetchContractFunctions } from '@/lib/contracts';
import { EntryPointSelect } from '../entry-point-select';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue
} from '@/components/ui/select';
import CopyToClipboardElement from '../ui/copy-to-clipboard';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { useRouter } from 'next/navigation';

export function SimulateTransactionPage({
	txHash,
	title = 'Simulate transaction',
	description = 'Configure your invoke transaction for simulation.',
	simulationPayload
}: {
	txHash?: string;
	title?: string;
	description?: string;
	simulationPayload?: SimulationPayload;
}) {
	const defaultTransactionVersion = 3;
	const [alert, setAlert] = useState(false);
	const validateHexFormat = (value: string) => /^0x[0-9a-fA-F]+$/.test(value) || value === '';
	const validateCalldata = useCallback((calldata: string[]) => {
		return calldata.every((item) => validateHexFormat(item));
	}, []);
	const router = useRouter();

	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingFunctions, setIsLoadingFunctions] = useState<{ [key: string]: boolean }>({});

	const [_senderAddress, _setSenderAddress] = useState<string>(
		simulationPayload?.senderAddress ?? ''
	);
	const [_numberOfContracts, _setNumberOfContracts] = useState<number>(
		simulationPayload?.calls?.length || 1
	);

	const [_contractCalls, _setContractCalls] = useState<SimpleContractCall[]>([]);

	const [_contractCallsFunctions, _setContractCallsFunctions] = useState<{ [key: string]: any }>(
		{}
	);

	const [_blockNumber, _setBlockNumber] = useState<number | ''>(
		simulationPayload?.blockNumber ?? ''
	);

	const [_transactionVersion, _setTransactionVersion] = useState<number>(
		simulationPayload?.transactionVersion || defaultTransactionVersion
	);

	const [_chain, _setChain] = useState<Chain | undefined>();

	const onChainChangedCallback = async (chain: Chain) => {
		_setChain(chain);
		_setContractCalls((prev) => {
			const newCalls = prev.map((item) => ({
				...item
			}));
			return newCalls;
		});
	};
	const handleNumberOfContractsChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value;

		const numValue = Math.max(1, parseInt(inputValue) || 1);

		_setNumberOfContracts(numValue);
	};

	const handleBlockNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputValue = e.target.value;

		if (inputValue === '') {
			_setBlockNumber('');
			return;
		}

		if (/^0$|^[1-9]\d*$/.test(inputValue)) {
			const numValue = parseInt(inputValue, 10);
			_setBlockNumber(numValue);
		} else {
			e.target.value = _blockNumber !== null ? _blockNumber.toString() : '';
		}
	};

	useEffect(() => {
		if (!simulationPayload) return;

		_setSenderAddress(simulationPayload.senderAddress ?? '');
		_setBlockNumber(simulationPayload.blockNumber ?? '');

		if (simulationPayload.chainId) {
			_setChain({ chainId: simulationPayload.chainId });
		} else if (simulationPayload.rpcUrl) {
			_setChain({
				network: {
					rpcUrl: simulationPayload.rpcUrl,
					networkName: 'Custom Network'
				}
			});
		}

		if (simulationPayload.calls && simulationPayload.calls.length > 0) {
			_setContractCalls(simulationPayload.calls);
			_setNumberOfContracts(simulationPayload.calls.length);
		} else {
			_setContractCalls([{ address: '', function_name: '', calldata: '' }]);
			_setNumberOfContracts(1);
		}

		_setTransactionVersion(simulationPayload.transactionVersion || defaultTransactionVersion);
	}, [simulationPayload]);

	useEffect(() => {
		_setContractCallsFunctions({});
		const initializeContractFunctions = async () => {
			if (_chain && _contractCalls && _contractCalls.length > 0) {
				const validContracts = _contractCalls.filter(
					(call) => call.address && validateHexFormat(call.address)
				);

				if (validContracts.length > 0) {
					setIsLoading(true);
					const uniqueContracts = Array.from(
						new Map(validContracts.map((call) => [call.address, call])).values()
					);
					try {
						await Promise.all(
							uniqueContracts.map((call) => fetchFunctionsForContractAddress(call.address))
						);
					} finally {
						setIsLoading(false);
					}
				}
			}
		};
		initializeContractFunctions();
	}, [_chain]);

	const fetchFunctionsForContractAddress = async (
		contractAddress: string,
		chainIdOverride?: string
	) => {
		const chainId = chainIdOverride || _chain?.chainId;

		if (!chainId || !validateHexFormat(contractAddress)) {
			return;
		}

		setIsLoadingFunctions((prev) => ({
			...prev,
			[contractAddress]: true
		}));
		try {
			const result = await fetchContractFunctions({
				contractAddress,
				network: chainId
			});

			if (result && result.entry_point_datas) {
				_setContractCallsFunctions((prev) => ({
					...prev,
					[contractAddress]: result.entry_point_datas
				}));
			}
		} catch (error) {
			console.log('Error fetching functions - ABI not found for contract address');
			if (error instanceof Error && error.message === 'ABI not found for contract address') {
				_setContractCallsFunctions((prev) => {
					const { contractAddress, ...rest } = prev;
					return rest;
				});
				_setContractCalls((prev) => {
					const newState = prev.map((item) => {
						if (item.address === contractAddress) {
							item.function_name = '';
						}
						return item;
					});
					return newState;
				});
			}
		} finally {
			setIsLoadingFunctions((prev) => ({
				...prev,
				[contractAddress]: false
			}));
		}
	};

	useEffect(() => {
		if (_contractCalls.length === _numberOfContracts) return;

		const newCalls = [..._contractCalls];

		if (newCalls.length < _numberOfContracts) {
			for (let i = newCalls.length; i < _numberOfContracts; i++) {
				newCalls.push({
					address: '',
					function_name: '',
					calldata: ''
				});
			}
		} else if (newCalls.length > _numberOfContracts) {
			newCalls.splice(_numberOfContracts);
		}

		_setContractCalls(newCalls);
	}, [_numberOfContracts]);

	function onDialogSubmit() {
		const processedCalls = _contractCalls.map((call) => ({
			...call,
			calldata: call.calldata.trim() === '' ? '' : call.calldata
		}));

		const allCallsValid = processedCalls.every(
			(call) => validateHexFormat(call.address) // && call.function_name
		);

		const allCalldataValid = processedCalls.every((call) => {
			if (call.calldata.trim() === '') {
				return false;
			}

			const calldataLines = call.calldata
				.trim()
				.split('\n')
				.filter((line) => line.trim() !== '');
			return validateCalldata(calldataLines);
		});

		if (!allCallsValid || !allCalldataValid) {
			setAlert(true);
			return;
		}

		const simulationPayload: SimulationPayload = {
			senderAddress: _senderAddress,
			calls: processedCalls,
			blockNumber: _blockNumber === '' ? undefined : _blockNumber,
			transactionVersion: _transactionVersion
		};

		if (_chain) {
			if (_chain.chainId) {
				simulationPayload.chainId = _chain.chainId;
			} else if (_chain.network) {
				simulationPayload.rpcUrl = _chain.network.rpcUrl;
			}
		} else {
			throw new Error('Chain is not defined');
		}

		if (
			simulationPayload.senderAddress === '' ||
			!validateHexFormat(simulationPayload.senderAddress) ||
			![1, 3].includes(simulationPayload.transactionVersion)
		) {
			setAlert(true);
		} else {
			openSimulationPage(simulationPayload);
		}
	}

	const FieldAlert = () => {
		const getValidationErrors = () => {
			const errors = [];
			const emptyFields = [];

			if (!_chain) emptyFields.push('Network');
			if (!_senderAddress) emptyFields.push('Sender Address');

			const hasEmptyAddresses = _contractCalls.some(
				(call) => !call.address || !validateHexFormat(call.address)
			);
			if (hasEmptyAddresses) {
				emptyFields.push('Contract Address');
			}

			const hasEmptyFunctions = _contractCalls.some((call) => !call.function_name);
			if (hasEmptyFunctions) {
				emptyFields.push('Entry Point');
			}

			if (!_transactionVersion) emptyFields.push('Transaction version');

			if (emptyFields.length > 0) {
				errors.push(
					`The ${emptyFields.join(', ')} field${emptyFields.length > 1 ? 's' : ''} ${
						emptyFields.length === 1 ? 'is' : 'are'
					} required for all calls`
				);
			}

			if (_senderAddress && !validateHexFormat(_senderAddress)) {
				errors.push('Sender address must be a hexadecimal number starting with 0x');
			}

			_contractCalls.forEach((call, index) => {
				if (call.address && !validateHexFormat(call.address)) {
					errors.push(
						`Contract address in call #${index + 1} must be a hexadecimal number starting with 0x`
					);
				}

				if (call.address && call.calldata && call.calldata.trim() !== '') {
					const calldataArray = call.calldata
						.trim()
						.split('\n')
						.filter((line) => line.trim() !== '');
					if (!validateCalldata(calldataArray)) {
						errors.push(
							`Calldata in call #${
								index + 1
							} must be a list of hexadecimal numbers, each starting with 0x`
						);
					}
				}
			});

			if (![1, 3].includes(_transactionVersion)) {
				errors.push('Transaction version must be either 1 or 3');
			}

			return errors.join('. ');
		};

		const validationMessage = getValidationErrors();

		if (!validationMessage) {
			return null;
		}
		return (
			<Alert variant="destructive" className="mt-4">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>Your form contains errors. Scroll up to see them.</AlertDescription>
			</Alert>
		);
	};

	useEffect(() => {
		if (alert) {
			const allAddressesValid = _contractCalls.every((call) => validateHexFormat(call.address));

			const allFunctionsSelected = _contractCalls.every((call) => !!call.function_name);

			const allCalldataValid = _contractCalls.every((call) => {
				const calldataLines = call.calldata
					.trim()
					.split('\n')
					.filter((line) => line.trim() !== '');
				return (
					validateCalldata(calldataLines) &&
					calldataLines.length ===
						_contractCallsFunctions[call.address]?.find(
							(item: string) => item[0] === call.function_name
						)?.[1]?.inputs?.length
				);
			});

			if (
				_chain &&
				_senderAddress !== '' &&
				validateHexFormat(_senderAddress) &&
				allAddressesValid &&
				allFunctionsSelected &&
				allCalldataValid &&
				[1, 3].includes(_transactionVersion)
			) {
				setAlert(false);
			}
		}
	}, [_chain, _senderAddress, _contractCalls, _transactionVersion, alert, validateCalldata]);

	const handleContractAddressChange = async (index: number, newAddress: string) => {
		const newCalls = [..._contractCalls];
		const oldAddress = newCalls[index].address;

		newCalls[index] = {
			...newCalls[index],
			address: newAddress,
			function_name: ''
		};

		_setContractCalls(newCalls);

		/* if (newAddress && validateHexFormat(newAddress) && newAddress !== oldAddress) {
			await fetchFunctionsForContractAddress(newAddress);
		} */
	};

	const handleFunctionNameChange = (index: number, newFunctionName: string) => {
		_setContractCalls((prevCalls) => {
			return prevCalls.map((call, idx) => {
				if (idx === index) {
					if (newFunctionName === simulationPayload?.calls[index]?.function_name) {
						return {
							...call,
							address: call.address,
							function_name: newFunctionName
						};
					} else {
						return {
							calldata: call.calldata,
							address: call.address,
							function_name: newFunctionName
						};
					}
				}
				return call;
			});
		});
	};

	const handleCalldataChange = (index: number, newCalldata: string) => {
		const newCalls = [..._contractCalls];
		newCalls[index] = {
			...newCalls[index],
			calldata: newCalldata
		};
		_setContractCalls(newCalls);
	};

	return (
		<>
			<HeaderNav />
			<main className="overflow-y-scroll h-[calc(100vh-650px)] xl:flex xl:justify-between flex-grow relative">
				<div className="left-8 px-4 py-8 xl:block hidden">
					<Button onClick={() => router.back()} variant="outline">
						<ArrowLeftIcon className="w-4 h-4 mr-2" /> Back
					</Button>
				</div>
				<div className="xl:hidden block px-4 py-8">
					<Button onClick={() => router.back()} variant="outline">
						<ArrowLeftIcon className="w-4 h-4 mr-2" /> Back
					</Button>
				</div>

				<div className="w-full flex justify-center">
					<div className="w-full max-w-5xl px-4 py-8">
						<div className="mb-6">
							<div className="flex flex-col gap-2">
								<h1 className="text-xl font-medium flex flex-nowrap items-center">
									{title}
									{txHash && (
										<CopyToClipboardElement
											value={txHash}
											toastDescription="The address has been copied."
										>
											{shortenHash(txHash)}
										</CopyToClipboardElement>
									)}
								</h1>
								<h3 className="text-muted-foreground">{description}</h3>
							</div>
						</div>

						<div className="rounded-lg py-4">
							<div className="grid gap-6">
								<div className="grid grid-cols-4 items-center gap-y-2 gap-x-4">
									<Label htmlFor="chain-id" className="text-right">
										Network
									</Label>
									<NetworksSelect
										isLoading={isLoading}
										simulationPayload={simulationPayload}
										onChainChangedCallback={onChainChangedCallback}
									/>
									{alert && !_chain && (
										<p className="text-xs text-muted-foreground text-red-500 col-span-3 col-start-2">
											Network is required.
										</p>
									)}
								</div>

								<div className="grid grid-cols-4 items-center gap-y-2 gap-x-4">
									<Label htmlFor="sender-address" className="text-right">
										Sender address
									</Label>
									<Input
										id="sender-address"
										value={_senderAddress}
										onChange={(e) => _setSenderAddress(e.target.value)}
										className={`col-span-3 font-mono ${
											alert &&
											(_senderAddress === '' || !validateHexFormat(_senderAddress)) &&
											' border-red-500'
										}`}
									/>
									{alert && _senderAddress === '' && (
										<p className="text-xs text-muted-foreground text-red-500 col-span-3 col-start-2">
											Sender address is required.
										</p>
									)}
									{alert && !validateHexFormat(_senderAddress) && (
										<p className="text-xs text-muted-foreground text-red-500 col-span-3 col-start-2">
											Sender address must be a hexadecimal number.
										</p>
									)}
								</div>

								{/* <div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="number-contracts" className="text-right">
										Number of contract calls
									</Label>
									<Input
										id="number-contracts"
										value={_numberOfContracts}
										type="number"
										min={1}
										onChange={handleNumberOfContractsChange}
										className={`col-span-3 font-mono ${
											alert && _numberOfContracts < 1 && ' border-red-500'
										}`}
									/>
								</div> */}

								{_contractCalls.map((call, index) => {
									return (
										<fieldset key={index} /*className="border rounded-md p-4"*/>
											{/*<legend className="px-2 font-medium text-sm">Call #{index + 1}</legend>*/}
											<div className="grid gap-4">
												<div className="grid grid-cols-4 items-center gap-x-4 gap-y-2">
													<Label htmlFor={`contract-address-${index}`} className="text-right">
														Contract address
													</Label>
													<Input
														id={`contract-address-${index}`}
														value={call.address}
														onChange={(e) => handleContractAddressChange(index, e.target.value)}
														className={`col-span-3 font-mono ${
															alert &&
															(!call.address || !validateHexFormat(call.address)) /*||
																!_contractCallsFunctions[call.address]*/ &&
															' border-red-500'
														}`}
													/>
													{alert && !call.address && (
														<p className="text-xs text-red-500 col-span-3 col-start-2">
															Contract address is required.
														</p>
													)}
													{alert && !validateHexFormat(call.address) && (
														<p className="text-xs text-red-500 col-span-3 col-start-2">
															Contract address must be a hexadecimal number.
														</p>
													)}
													{/*alert &&
														!_contractCallsFunctions[call.address] &&
														call.address &&
														validateHexFormat(call.address) && (
															<p className="text-xs text-red-500 col-span-3 col-start-2">
																This contract is not deployed on {_chain?.chainId}.
															</p>
														)*/}
												</div>
												{/* <EntryPointSelect
													chain={_chain}
													entryPoints={call.address ? _contractCallsFunctions[call.address] : null}
													value={call.function_name}
													isLoading={call.address ? isLoadingFunctions[call.address] : false}
													isError={alert && call.function_name === ''}
													onChange={(value) => handleFunctionNameChange(index, value)}
												/> */}
												<div className="grid grid-cols-4 items-center gap-y-2 gap-x-4">
													<Label htmlFor={`calldata-${index}`} className="text-right">
														Calldata
													</Label>
													<Textarea
														// disabled={call.function_name === ''}
														id={`calldata-${index}`}
														value={call.calldata}
														placeholder="Enter raw calldata here."
														required
														className={`col-span-3 font-mono h-32 ${
															alert &&
															call.address &&
															call.calldata.trim() !== '' &&
															!validateCalldata(
																call.calldata
																	.trim()
																	.split('\n')
																	.filter((line) => line.trim() !== '')
															)
																? 'border-red-500'
																: ''
														}`}
														onChange={(e) => handleCalldataChange(index, e.target.value)}
													/>
													{(() => {
														/* const calldataLines = call.calldata.trim()
															? call.calldata
																	.trim()
																	.split('\n')
																	.filter((line) => line.trim() !== '')
															: [];

														const hasInvalidCalldataFormat =
															call.calldata !== '' && !validateCalldata(calldataLines); */

														if (alert) {
															if (call.calldata === '') {
																return (
																	<p className="text-xs text-red-500 col-span-3 col-start-2">
																		Calldata cannot be empty.
																	</p>
																);
															}
														}

														return null;
													})()}
												</div>
											</div>
										</fieldset>
									);
								})}

								<div className="grid grid-cols-4 items-center gap-x-4 gap-y-2">
									<Label htmlFor="block-number" className="text-right">
										Block number
									</Label>
									<Input
										type="text"
										inputMode="numeric"
										id="block-number"
										value={_blockNumber ?? ''}
										onChange={handleBlockNumberChange}
										className="col-span-3 font-mono [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
										placeholder="Latest"
									/>
									<p className="text-xs text-muted-foreground col-span-3 col-start-2">
										If you leave the field empty, the latest block will be used.
									</p>
								</div>

								{/* <div className="grid grid-cols-4 items-center gap-4">
									<Label htmlFor="tx-version" className="text-right">
										Transaction version
									</Label>
									<div className="col-span-3">
										<Select
											value={_transactionVersion.toString()}
											onValueChange={(value) => _setTransactionVersion(parseInt(value))}
										>
											<SelectTrigger className="font-mono">
												<SelectValue placeholder="Select version" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="1">Version 1</SelectItem>
												<SelectItem value="3">Version 3</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</div> */}

								{alert && <FieldAlert />}
								<div className="flex justify-end mt-4 mb-12">
									<Button type="submit" onClick={onDialogSubmit}>
										<PlayIcon className="w-4 h-4 mr-2" /> Run Simulation
									</Button>
								</div>
							</div>
						</div>
					</div>
				</div>
				<div></div>
			</main>
			<Footer />
		</>
	);
}
