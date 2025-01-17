import React, {
  FC,
  useState,
  ReactNode,
  useCallback,
  useEffect,
} from 'react'

import { useAccount } from 'wagmi'

import dayjs from 'dayjs'
import { ExpirationOption } from 'types/ExpirationOption'
import expirationOptions from '../../../lib/defaultExpirationOptions'
import currencyOptions from '../../../lib/defaultCurrencyOptions'

import { Collection, Token } from '__generated__/graphql'
import { Currency } from 'types/currency'
import { gql } from '__generated__'
import { useMutation, useQuery } from '@apollo/client'
import { useRoyaltyFee, useStrategyFee  } from 'hooks'
import { useSdk } from 'context/SDKProvider'
import { MakerOrder } from "@gulabs/gu-nft-marketplace-sdk"
import { CREATE_ORDER, GET_LISTED } from 'graphql/queries/orders'
import { parseUnits } from 'ethers/lib/utils.js'
import { GET_NONCE } from 'graphql/queries/nonces'
import { GET_TOKEN } from 'graphql/queries/tokens'
import { GET_COLLECTION } from 'graphql/queries/collections'

export type ListingData = MakerOrder | null

export enum RequestUserStep {
  APPROVAL,
  CANCEL_LIST,
  SIGN  
}

export enum ListingStep {
  SelectMarkets,
  SetPrice,
  ListItem,
  Complete,
}

type ChildrenProps = {
  token?: Token
  collection?: Collection
  listingStep: ListingStep
  setListingStep: React.Dispatch<React.SetStateAction<ListingStep>>
  expirationOptions: ExpirationOption[]
  setExpirationOption: React.Dispatch<React.SetStateAction<ExpirationOption>>
  expirationOption: ExpirationOption
  listingData: ListingData
  transactionError?: Error | null
  listToken: () => void
  price: string
  setPrice: (price: string) => void
  currencyOptions: Currency[]
  currencyOption: Currency
  setCurrencyOption: (currency: Currency) => void
  loading: boolean,
  royaltyFee: number,
  protocolFee: number,
  requestUserStep: RequestUserStep,
  steps: RequestUserStep[]
}

type Props = {
  open: boolean
  tokenId?: string
  collectionId?: string
  children: (props: ChildrenProps) => ReactNode
}

export const ListModalRenderer: FC<Props> = ({
  open,
  tokenId,
  collectionId,
  children,
}) => {
  const sdk = useSdk()
  const account = useAccount()
  const [listingStep, setListingStep] = useState<ListingStep>(ListingStep.SelectMarkets)
  const [listingData, setListingData] = useState<ListingData>(null)
  const [transactionError, setTransactionError] = useState<Error | null>()
  const [price, setPrice] = useState<string>('0')
  const [expirationOption, setExpirationOption] = useState<ExpirationOption>(
    expirationOptions[5] // a month
  )
  const [currencyOption, setCurrencyOption] = useState<Currency>(
    currencyOptions[0]
  )
  // TO-DO: strategyOptions
  const strategy = sdk.addresses.STRATEGY_STANDARD_SALE_DEPRECATED;
  const [createOrderMutation] = useMutation(CREATE_ORDER);

  const [requestUserStep, setRequestUserStep] = useState<RequestUserStep>(RequestUserStep.APPROVAL)
  const [steps, setSteps] = useState<RequestUserStep[]>([])

  const { data: dataNonce, refetch: refetchNonce } = useQuery(GET_NONCE, {
    variables: { signer: account.address?.toLowerCase() as string },
    skip: !account?.address
  })

  const nonce = dataNonce?.nonce?.nonce
  
  const { data: listedData, refetch: refetchListed } = useQuery(GET_LISTED, {
    variables: {
      where: {
        collectionAddress: collectionId as string,
        tokenId: `${tokenId}`
      }
    },
    skip: !tokenId || !collectionId
  })

  const existListing = listedData?.listed;

  const { data: tokenData, loading, refetch: refetchToken } = useQuery(GET_TOKEN, {
    variables: { id: `${collectionId}-${tokenId}` },
    skip: !collectionId || !tokenId
  })
  const { data: collectionData } = useQuery(GET_COLLECTION, {
    variables: { id: collectionId as string },
    skip: !collectionId
  })

  const token = tokenData?.token as Token
  const collection = collectionData?.collection
  
  const protocolFee = useStrategyFee(strategy)
  const royaltyFee = useRoyaltyFee(token?.collection as string, token?.tokenId as string)

  useEffect(() => {
    if (!open) {
      setListingStep(ListingStep.SelectMarkets)
      setTransactionError(null)
      setExpirationOption(expirationOptions[5])
      setListingData(null)
      setPrice("0")
    }
    
    setCurrencyOption(currencyOptions[0])
    setRequestUserStep(RequestUserStep.APPROVAL)

    if (tokenId) {
      refetchListed()
    }
    if (account?.address) {
      refetchNonce()
    }
    if (collectionId && tokenId) {
      refetchToken()
    }
  }, [account?.address, collectionId, open, refetchListed, refetchNonce, refetchToken, tokenId])

  const listToken = useCallback(async () => {
    try {
      if (!sdk.signer) {
        const error = new Error('Missing a signer')
        setTransactionError(error)
        throw error
      }
      
      if (!collectionId) {
        const error = new Error('Missing collection id')
        setTransactionError(error)
        throw error
      }

      if (!tokenId) {
        const error = new Error('Missing collection id')
        setTransactionError(error)
        throw error
      }

      const expirationTime = dayjs()
      .add(expirationOption.relativeTime, expirationOption.relativeTimeUnit)
      .unix()
      
      setListingStep(ListingStep.ListItem)
  
      const { maker, isCollectionApproved } = await sdk.createMakerAsk({
        collection: collectionId,
        price: parseUnits(`${price}`, currencyOption?.decimals).toString(),
        tokenId,
        amount: 1,
        strategy,
        currency: currencyOption.contract,
        nonce: nonce || 0,
        startTime: dayjs().unix(),
        endTime: expirationTime,
        minPercentageToAsk: 0, // TO-DO: update later
        params: []
      })
      
      setListingData(maker)

      if (!isCollectionApproved && existListing) {
        setSteps([RequestUserStep.APPROVAL, RequestUserStep.CANCEL_LIST, RequestUserStep.SIGN])
      } else if (!isCollectionApproved && !existListing) {
        setSteps([RequestUserStep.APPROVAL, RequestUserStep.SIGN])
      } else if (isCollectionApproved && existListing) {
        setSteps([RequestUserStep.CANCEL_LIST, RequestUserStep.SIGN])
      } else {
        setSteps([RequestUserStep.SIGN])
      }

      if (!isCollectionApproved) {
        setRequestUserStep(RequestUserStep.APPROVAL)
        const tx = await sdk.approveAllCollectionItems(collectionId, true)
        await tx.wait()
      }

      if (existListing) {
        setRequestUserStep(RequestUserStep.CANCEL_LIST)
        const tx = await sdk.cancelMultipleMakerOrders([existListing?.nonce]).call()
        await tx.wait()
      }
  
      setRequestUserStep(RequestUserStep.SIGN)
      const signature = await sdk.signMakerOrder(maker)

      await createOrderMutation({ variables: { createOrderInput: {
        collectionAddress: maker.collection,
        price: maker.price.toString(),
        tokenId: maker.tokenId.toString(),
        amount: Number(maker.amount),
        strategy: maker.strategy,
        currencyAddress: maker.currency,
        nonce: maker.nonce.toString(),
        startTime: Number(maker.startTime),
        endTime: Number(maker.endTime),
        minPercentageToAsk: Number(maker.minPercentageToAsk),
        params: maker.params.toString(),
        signer: maker.signer,
        signature: signature,
        isOrderAsk: maker.isOrderAsk
      }}})

      setListingStep(ListingStep.Complete)
    } catch (error: any) {
      setTransactionError(error)
    }
  
  }, [sdk, collectionId, tokenId, expirationOption, price, currencyOption, strategy, nonce, existListing, createOrderMutation])

  useEffect(() => {
    if (tokenId) {
      refetchListed()
    }
    if (account?.address) {
      refetchNonce()
    }
    if (collectionId && tokenId) {
      refetchToken()
    }
  }, [account?.address, collectionId, refetchListed, refetchNonce, refetchToken, tokenId, transactionError])
  
  return <>{children({
    token,
    collection,
    listingStep,
    setListingStep,
    expirationOption,
    expirationOptions,
    setExpirationOption,
    listToken,
    price,
    setPrice,
    currencyOptions,
    currencyOption,
    setCurrencyOption,
    loading,
    protocolFee,
    royaltyFee,
    listingData,
    transactionError,
    requestUserStep,
    steps
})}</>
}

ListModalRenderer.displayName = 'ListModalRenderer'
