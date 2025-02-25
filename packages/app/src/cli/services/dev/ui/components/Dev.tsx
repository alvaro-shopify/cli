import {developerPreviewUpdate, disableDeveloperPreview, enableDeveloperPreview} from '../../../context.js'
import {fetchAppPreviewMode} from '../../fetch.js'
import {OutputProcess} from '@shopify/cli-kit/node/output'
import {ConcurrentOutput} from '@shopify/cli-kit/node/ui/components'
import {useAbortSignal} from '@shopify/cli-kit/node/ui/hooks'
import React, {FunctionComponent, useEffect, useMemo, useRef, useState} from 'react'
import {AbortController, AbortSignal} from '@shopify/cli-kit/node/abort'
import {Box, Text, useInput, useStdin} from 'ink'
import {handleCtrlC} from '@shopify/cli-kit/node/ui'
import {openURL} from '@shopify/cli-kit/node/system'
import figures from '@shopify/cli-kit/node/figures'
import {isUnitTest} from '@shopify/cli-kit/node/context/local'
import {treeKill} from '@shopify/cli-kit/node/tree-kill'
import {Writable} from 'stream'

export interface DevProps {
  processes: OutputProcess[]
  abortController: AbortController
  previewUrl: string
  graphiqlUrl: string
  app: {
    canEnablePreviewMode: boolean
    developmentStorePreviewEnabled?: boolean
    apiKey: string
    token: string
  }
  pollingTime?: number
}

const Dev: FunctionComponent<DevProps> = ({abortController, processes, previewUrl, graphiqlUrl, app, pollingTime = 5000}) => {
  const {apiKey, token, canEnablePreviewMode, developmentStorePreviewEnabled} = app
  const {isRawModeSupported: canUseShortcuts} = useStdin()
  const pollingInterval = useRef<NodeJS.Timeout>()
  const [statusMessage, setStatusMessage] = useState(`Preview URL: ${previewUrl}`)

  const {isAborted} = useAbortSignal(abortController.signal, async (err) => {
    if (err) {
      setStatusMessage('Shutting down dev because of an error ...')
    } else {
      setStatusMessage('Shutting down dev ...')
      setTimeout(() => {
        if (isUnitTest()) return
        treeKill(process.pid, 'SIGINT', false, () => {
          process.exit(0)
        })
      }, 2000)
    }
    clearInterval(pollingInterval.current)
    await disableDeveloperPreview({apiKey, token})
  })

  const [devPreviewEnabled, setDevPreviewEnabled] = useState<boolean>(true)
  const [error, setError] = useState<string | undefined>(undefined)

  const errorHandledProcesses = useMemo(() => {
    return processes.map((process) => {
      return {
        ...process,
        action: async (stdout: Writable, stderr: Writable, signal: AbortSignal) => {
          try {
            return await process.action(stdout, stderr, signal)
            // eslint-disable-next-line no-catch-all/no-catch-all
          } catch (error) {
            abortController.abort(error)
          }
        },
      }
    })
  }, [processes, abortController])

  useEffect(() => {
    const pollDevPreviewMode = async () => {
      try {
        const enabled = await fetchAppPreviewMode(apiKey, token)
        setDevPreviewEnabled(enabled ?? false)
        setError('')
        // eslint-disable-next-line no-catch-all/no-catch-all
      } catch (_) {
        setError('Failed to fetch the latest status of the development store preview, trying again in 5 seconds.')
      }
    }

    const enablePreviewMode = async () => {
      // Enable dev preview on app dev start
      try {
        await enableDeveloperPreview({apiKey, token})
        setError('')
        // eslint-disable-next-line no-catch-all/no-catch-all
      } catch (_) {
        setError(
          'Failed to turn on development store preview automatically.\nTry turning it on manually by pressing `d`.',
        )
        setDevPreviewEnabled(Boolean(developmentStorePreviewEnabled))
      }
    }

    if (canEnablePreviewMode) {
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      enablePreviewMode()

      const startPolling = () => {
        return setInterval(
          // eslint-disable-next-line @typescript-eslint/no-misused-promises
          () => pollDevPreviewMode(),
          pollingTime,
        )
      }

      pollingInterval.current = startPolling()
    }

    return () => {
      clearInterval(pollingInterval.current)
    }
  }, [canEnablePreviewMode])

  useInput(
    (input, key) => {
      handleCtrlC(input, key, () => abortController.abort())

      const onInput = async () => {
        try {
          setError('')

          if (input === 'p' && previewUrl) {
            await openURL(previewUrl)
          } else if (input === 'g' && graphiqlUrl) {
            openURL(graphiqlUrl)
          } else if (input === 'q') {
            abortController.abort()
          } else if (input === 'd' && canEnablePreviewMode) {
            const newDevPreviewEnabled = !devPreviewEnabled
            setDevPreviewEnabled(newDevPreviewEnabled)
            try {
              const developerPreviewUpdateSucceded = await developerPreviewUpdate({
                apiKey,
                token,
                enabled: newDevPreviewEnabled,
              })
              if (!developerPreviewUpdateSucceded) {
                throw new Error(`Failed to turn ${newDevPreviewEnabled ? 'on' : 'off'} development store preview.`)
              }
              // eslint-disable-next-line no-catch-all/no-catch-all
            } catch (_) {
              setDevPreviewEnabled(devPreviewEnabled)
              setError(`Failed to turn ${newDevPreviewEnabled ? 'on' : 'off'} development store preview.`)
            }
          }
          // eslint-disable-next-line no-catch-all/no-catch-all
        } catch (_) {
          setError('Failed to handle your input.')
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      onInput()
    },
    {isActive: Boolean(canUseShortcuts)},
  )

  return (
    <>
      <ConcurrentOutput
        processes={errorHandledProcesses}
        abortSignal={abortController.signal}
        keepRunningAfterProcessesResolve={true}
      />
      {/* eslint-disable-next-line no-negated-condition */}
      {!isAborted ? (
        <Box
          marginY={1}
          paddingTop={1}
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderBottom={false}
          borderLeft={false}
          borderRight={false}
          borderTop
        >
          {canUseShortcuts ? (
            <Box flexDirection="column">
              {canEnablePreviewMode ? (
                <Text>
                  {figures.pointerSmall} Press <Text bold>d</Text> {figures.lineVertical} toggle development store
                  preview: {}
                  {devPreviewEnabled ? <Text color="green">✔ on</Text> : <Text color="red">✖ off</Text>}
                </Text>
              ) : null}
              <Text>
                {figures.pointerSmall} Press <Text bold>g</Text> {figures.lineVertical} open the GraphiQL Explorer in your browser
              </Text>
              <Text>
                {figures.pointerSmall} Press <Text bold>p</Text> {figures.lineVertical} preview in your browser
              </Text>
              <Text>
                {figures.pointerSmall} Press <Text bold>q</Text> {figures.lineVertical} quit
              </Text>
            </Box>
          ) : null}
          <Box marginTop={canUseShortcuts ? 1 : 0}>
            <Text>{statusMessage}</Text>
          </Box>
          {error ? <Text color="red">{error}</Text> : null}
        </Box>
      ) : null}
    </>
  )
}

export {Dev}
