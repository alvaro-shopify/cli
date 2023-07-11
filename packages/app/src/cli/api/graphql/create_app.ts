import {gql} from 'graphql-request'

export const CreateAppQuery = gql`
  mutation AppCreate(
    $org: Int!
    $title: String!
    $appUrl: Url!
    $redir: [Url]!
    $type: AppType
    $requestedAccessScopes: [String!]
  ) {
    appCreate(
      input: {
        organizationID: $org
        title: $title
        applicationUrl: $appUrl
        redirectUrlWhitelist: $redir
        appType: $type
        requestedAccessScopes: $requestedAccessScopes
      }
    ) {
      app {
        id
        title
        apiKey
        organizationId
        apiSecretKeys {
          secret
        }
        appType
        grantedScopes
        applicationUrl
        redirectUrlWhitelist
        requestedAccessScopes
        webhookApiVersion
        embedded
        posEmbedded
        preferencesUrl
        contactEmail
        gdprWebhooks {
          customerDeletionUrl
          customerDataRequestUrl
          shopDeletionUrl
        }
        appProxy {
          subPath
          subPathPrefix
          url
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`

export interface CreateAppQueryVariables {
  org: number
  title: string
  appUrl: string
  redir: string[]
  type: string
  requestedAccessScopes?: string[]
}

export interface CreateAppQuerySchema {
  appCreate: {
    app: {
      id: string
      title: string
      apiKey: string
      organizationId: string
      apiSecretKeys: {
        secret: string
      }[]
      appType: string
      grantedScopes: string[]
      betas?: {
        unifiedAppDeployment?: boolean
        unifiedAppDeploymentOptIn?: boolean
      }
      applicationUrl: string
      redirectUrlWhitelist: string[]
      requestedAccessScopes?: string[]
      contactEmail: string
      webhookApiVersion: string
      embedded: boolean
      posEmbedded?: boolean
      preferencesUrl?: string
      gdprWebhooks?: {
        customerDeletionUrl?: string
        customerDataRequestUrl?: string
        shopDeletionUrl?: string
      }
      appProxy?: {
        proxySubPath: string
        proxySubPathPrefix: string
        proxyUrl: string
      }
    }
    userErrors: {
      field: string[]
      message: string
    }[]
  }
}
