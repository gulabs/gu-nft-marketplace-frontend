import { FC, useEffect, useRef } from 'react'
import { useMediaQuery } from 'react-responsive'
import {
  Text,
  Flex,
  FormatCryptoCurrency,
  Anchor,
  TableCell,
  TableRow,
  Box,
} from '../primitives'
import { useIntersectionObserver } from 'usehooks-ts'
import Link from 'next/link'
import Image from 'next/image'
import { useENSResolver, useTimeSince } from 'hooks'
import { constants } from 'ethers'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faExternalLink,
  faHand,
  faRightLeft,
  faSeedling,
  faShoppingCart,
  faTag,
  faTrash,
  faXmark,
} from '@fortawesome/free-solid-svg-icons'
import LoadingSpinner from './LoadingSpinner'
import Img from 'components/primitives/Img'
import { QueryResult, useQuery } from '@apollo/client'
import { Activity, ActivityType, Activity_FilterArgs, Exact, GetActivitiesQuery, InputMaybe } from '__generated__/graphql'
import { GET_TOKEN } from 'graphql/queries/tokens'
import { useNetwork } from 'wagmi'

type Props = {
  query: QueryResult<GetActivitiesQuery, Exact<{
    first?: InputMaybe<number> | undefined;
    skip?: InputMaybe<number> | undefined;
    where?: InputMaybe<Activity_FilterArgs> | undefined;
}>>
}

export const ActivityTable: FC<Props> = ({ query }) => {
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadMoreObserver = useIntersectionObserver(loadMoreRef, {})
  const { fetchMore } = query;

  const activities = query.data?.activities || []

  useEffect(() => {
    const isVisible = !!loadMoreObserver?.isIntersecting
    if (isVisible) {
      fetchMore({
        variables: {
          skip: activities.length
        }
      })
    }
  }, [activities.length, loadMoreObserver?.isIntersecting, fetchMore])

  return (
    <>
      {!query.loading &&
      activities &&
      activities.length === 0 ? (
        <Flex direction="column" align="center" css={{ py: '$6', gap: '$4' }}>
          <Image alt='' src="/icons/activity-icon.svg" width={40} height={40} />
          <Text>No activity yet</Text>
        </Flex>
      ) : (
        <Flex direction="column" css={{ width: '100%', pb: '$2' }}>
          {activities.map((activity, i) => {
            if (!activity) return null

            return (
              <ActivityTableRow
                key={`${activity?.txHash}-${i}`}
                activity={activity}
              />
            )
          })}
          <Box ref={loadMoreRef} css={{ height: 20 }}></Box>
        </Flex>
      )}
      {query.loading && (
        <Flex align="center" justify="center" css={{ py: '$5' }}>
          <LoadingSpinner />
        </Flex>
      )}
    </>
  )
}

type ActivityTableRowProps = {
  activity: Activity
}

type Logos = {
  [key: string]: JSX.Element
}

const logos: Logos = {
  transfer: <FontAwesomeIcon icon={faRightLeft} width={16} height={16} />,
  sale: <FontAwesomeIcon icon={faShoppingCart} width={16} height={16} />,
  mint: <FontAwesomeIcon icon={faSeedling} width={16} height={16} />,
  burned: <FontAwesomeIcon icon={faTrash} width={16} height={16} />,
  listing_canceled: <FontAwesomeIcon icon={faXmark} width={16} height={16} />,
  ask_cancel: <FontAwesomeIcon icon={faXmark} width={16} height={16} />,
  offer_canceled: <FontAwesomeIcon icon={faXmark} width={16} height={16} />,
  ask: <FontAwesomeIcon icon={faTag} width={16} height={16} />,
  bid: <FontAwesomeIcon icon={faHand} width={16} height={16} />,
}

type ActivityDescription = {
  [key: string]: string
}

const activityTypeToDesciptionMap: ActivityDescription = {
  [ActivityType.CancelListingEvent]: 'Listing Canceled',
  [ActivityType.CancelOfferEvent]: 'Offer Canceled',
  [ActivityType.MintEvent]: 'Mint',
  [ActivityType.ListingEvent]: 'List',
  [ActivityType.OfferEvent]: 'Offer',
  [ActivityType.NftTransferEvent]: 'Transfer',
  [ActivityType.SaleEvent]: 'Sale',
}

const activityTypeToDesciption = (activityType: string) => {
  return activityTypeToDesciptionMap[activityType] || activityType
}

const ActivityTableRow: FC<ActivityTableRowProps> = ({ activity }) => {
  const timeSince = useTimeSince(activity?.timestamp as number)
  const isSmallDevice = useMediaQuery({ maxWidth: 700 })
  const { chain } = useNetwork()
  const blockExplorerBaseUrl =
  chain?.blockExplorers?.default?.url || 'https://etherscan.io'
  const href = activity?.tokenId
    ? `/collection/${activity?.collection}/${activity?.tokenId}`
    : `/collection/${activity?.collection}`

  const { data: tokenData } = useQuery(GET_TOKEN, {
    variables: {
      id: `${activity.collection}-${activity.tokenId}`
    },
    skip: !activity.collection || !activity.tokenId
  })
  const imageSrc = tokenData?.token?.image as string
  
  let activityDescription = activityTypeToDesciption(activity?.type || '')
  let attributeDescription = ''

  /*
  Ignoring typescript warnings as API types for the 
  criteria object are incorrectly assigned due to joi.alternatives
  */
  if (activityDescription === 'Offer') {
    /* @ts-ignore */
    if (activity.order?.criteria?.kind === 'collection') {
      activityDescription = 'Collection Offer'
      /* @ts-ignore */
    } else if (activity.order?.criteria?.kind === 'attribute') {
      activityDescription = 'Attribute Offer'
      /* @ts-ignore */
      attributeDescription = `${activity.order?.criteria?.data?.attribute?.key}: ${activity.order?.criteria?.data.attribute.value}`
    }
  }

  const { displayName: toDisplayName } = useENSResolver(activity?.to as string)
  const { displayName: fromDisplayName } = useENSResolver(activity?.from as string)


  if (!activity) {
    return null
  }

  if (isSmallDevice) {
    return (
      <TableRow key={activity.txHash} css={{ gridTemplateColumns: '1fr' }}>
        <TableCell css={{ pr: '0', width: '100%', minWidth: 0 }}>
          <Flex direction="column" css={{ gap: '$3' }}>
            <Flex css={{ color: '$gray11' }} align="center" justify="between">
              <Flex align="center">
                {activity.type && logos[activity.type]}
                <Text
                  style="subtitle1"
                  ellipsify
                  css={{
                    ml: '$2',
                    color: '$gray11',
                    fontSize: '14px',
                    minWidth: 0,
                  }}
                >
                  {activityDescription}
                </Text>
              </Flex>
              <Flex align="center" justify="end" css={{ gap: '$3' }}>
                <Text
                  style="subtitle3"
                  css={{ fontSize: '12px', color: '$gray11' }}
                >
                  {timeSince}
                </Text>

                {activity.txHash && (
                  <Anchor
                    color="primary"
                    target="_blank"
                    rel="noopener noreferrer"
                    href={`${blockExplorerBaseUrl}/tx/${activity.txHash}`}
                  >
                    <FontAwesomeIcon
                      icon={faExternalLink}
                      width={12}
                      height={15}
                    />
                  </Anchor>
                )}
              </Flex>
            </Flex>
            <Flex align="center" justify="between">
              <Link
                href={href}
                passHref
                style={{ maxWidth: '100%', minWidth: 0 }}
              >
                <Flex align="center">
                  {imageSrc && (
                    <Image
                      style={{ borderRadius: '4px', objectFit: 'cover' }}
                      loader={({ src }) => src}
                      src={imageSrc}
                      alt={`${activity.tokenId}`}
                      width={48}
                      height={48}
                    />
                  )}
                  <Flex align="start" direction="column" css={{ ml: '$2' }}>
                    <Text ellipsify css={{ fontSize: '14px' }}>
                      {activity?.tokenId}
                    </Text>
                    <Text
                      ellipsify
                      css={{ fontSize: '12px', color: '$gray11' }}
                    >
                      {attributeDescription}
                    </Text>
                  </Flex>
                </Flex>
              </Link>
              {activity.order?.price ? (
                <Flex
                  direction="column"
                  align="center"
                  css={{ minWidth: 'max-content', pl: '$2' }}
                >
                  <FormatCryptoCurrency
                    amount={activity.order?.price}
                    logoHeight={16}
                    textStyle="subtitle1"
                    css={{ mr: '$2', fontSize: '14px' }}
                  />
                </Flex>
              ) : (
                <span>-</span>
              )}
            </Flex>

            <Flex align="baseline" css={{ gap: '$2' }}>
              <Text
                style="subtitle3"
                css={{ fontSize: '12px', color: '$gray11' }}
              >
                From
              </Text>
              {activity.from &&
              activity.from !== constants.AddressZero ? (
                <Link href={`/profile/${activity.from}`}>
                  <Text
                    style="subtitle3"
                    css={{
                      color: '$primary11',
                      '&:hover': {
                        color: '$primary10',
                      },
                    }}
                  >
                    {fromDisplayName}
                  </Text>
                </Link>
              ) : (
                <span>-</span>
              )}
              <Text
                style="subtitle3"
                css={{ fontSize: '12px', color: '$gray11' }}
              >
                to
              </Text>
              {activity.to &&
              activity.to !== constants.AddressZero ? (
                <Link href={`/profile/${activity.to}`}>
                  <Text
                    style="subtitle3"
                    css={{
                      color: '$primary11',
                      '&:hover': {
                        color: '$primary10',
                      },
                    }}
                  >
                    {toDisplayName}
                  </Text>
                </Link>
              ) : (
                <span>-</span>
              )}
            </Flex>
          </Flex>
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow
      key={activity.txHash}
      css={{ gridTemplateColumns: '.75fr 1.25fr .9fr 1fr 1fr 1fr 1.1fr' }}
    >
      <TableCell css={{ color: '$gray11', minWidth: 0 }}>
        <Flex align="center" title={activityDescription}>
          {activity.type && logos[activity.type]}
          <Text
            style="subtitle1"
            ellipsify
            css={{
              ml: '$2',
              color: '$gray11',
              fontSize: '14px',
              cursor: 'default',
            }}
          >
            {activityDescription}
          </Text>
        </Flex>
      </TableCell>

      <TableCell css={{ minWidth: 0 }}>
        <Link href={href} passHref>
          <Flex align="center">
            {imageSrc && (
              <Img
                style={{ borderRadius: '4px', objectFit: 'cover' }}
                loader={({ src }) => src}
                src={imageSrc}
                alt="Activity Token Image"
                width={48}
                height={48}
              />
            )}
            <Flex
              align="start"
              direction="column"
              css={{ ml: '$2' }}
              style={{ maxWidth: '100%', minWidth: 0, overflow: 'hidden' }}
            >
              <Text ellipsify css={{ fontSize: '14px' }}>
                {activity.tokenId}
              </Text>
              <Text ellipsify css={{ fontSize: '12px', color: '$gray11' }}>
                {attributeDescription}
              </Text>
            </Flex>
          </Flex>
        </Link>
      </TableCell>
      <TableCell>
        {activity.order?.price
         ? (
          <Flex align="center">
            <FormatCryptoCurrency
              amount={activity.order?.price}
              logoHeight={16}
              textStyle="subtitle1"
              css={{ mr: '$2', fontSize: '14px' }}
            />
          </Flex>
        ) : (
          <span>-</span>
        )}
      </TableCell>
      <TableCell>
        <Flex direction="column" align="start">
          <Text style="subtitle3" color="subtle">
            Quantity
          </Text>
          <Text style="subtitle3">1</Text>
        </Flex>
      </TableCell>
      <TableCell css={{ minWidth: 0 }}>
        {activity.from &&
        activity.from !== constants.AddressZero ? (
          <Flex direction="column" align="start">
            <Text style="subtitle3" color="subtle">
              From
            </Text>
            <Link
              href={`/profile/${activity.from}`}
              style={{
                maxWidth: '100%',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <Text
                style="subtitle3"
                css={{
                  color: '$primary11',
                  '&:hover': {
                    color: '$primary10',
                  },
                }}
                ellipsify
              >
                {fromDisplayName}
              </Text>
            </Link>
          </Flex>
        ) : (
          <span>-</span>
        )}
      </TableCell>
      <TableCell css={{ minWidth: 0 }}>
        {activity.to && activity.to !== constants.AddressZero ? (
          <Flex direction="column" align="start">
            <Text style="subtitle3" color="subtle">
              To
            </Text>
            <Link
              href={`/profile/${activity.to}`}
              style={{
                maxWidth: '100%',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              <Text
                style="subtitle3"
                css={{
                  color: '$primary11',
                  '&:hover': {
                    color: '$primary10',
                  },
                }}
                ellipsify
              >
                {toDisplayName}
              </Text>
            </Link>
          </Flex>
        ) : (
          <span>-</span>
        )}
      </TableCell>
      <TableCell css={{ minWidth: 0 }}>
        <Flex align="center" justify="end" css={{ gap: '$3' }}>
          <Text style="subtitle3" color="subtle" ellipsify>
            {timeSince}
          </Text>

          {activity.txHash && (
            <Anchor
              href={`${blockExplorerBaseUrl}/tx/${activity.txHash}`}
              color="primary"
              target="_blank"
              rel="noopener noreferrer"
            >
              <FontAwesomeIcon icon={faExternalLink} width={12} height={15} />
            </Anchor>
          )}
        </Flex>
      </TableCell>
    </TableRow>
  )
}
