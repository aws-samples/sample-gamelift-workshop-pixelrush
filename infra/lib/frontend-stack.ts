import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

export interface FrontendStackProps extends cdk.StackProps {
  /** execute-api endpoint of the backend HTTP API (https://xxx.execute-api...). */
  apiEndpoint: string;
  /** Secret injected by CloudFront as x-origin-verify; Lambdas reject requests without it. */
  originVerifySecret: string;
}

/**
 * Single public entry point per the security requirement: CloudFront serves
 * the static site from a PRIVATE S3 bucket (OAC) and proxies /api/* to the
 * HTTP API, adding the x-origin-verify secret header. Direct access to the
 * bucket or to the execute-api URL is rejected.
 */
export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const apiDomain = cdk.Fn.select(2, cdk.Fn.split('/', props.apiEndpoint));
    const apiOrigin = new origins.HttpOrigin(apiDomain, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
      customHeaders: { 'x-origin-verify': props.originVerifySecret },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Forward query strings and body-relevant headers, but NOT the Host
          // header (the API GW needs its own host to route).
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      defaultRootObject: 'index.html',
      errorResponses: [
        // SPA fallback
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
      comment: 'PixelRush workshop frontend + API proxy',
    });

    // Deploy frontend/dist if it exists (built via `npm run build` before deploy).
    const distDir = path.join(__dirname, '../../frontend/dist');
    if (fs.existsSync(distDir)) {
      new s3deploy.BucketDeployment(this, 'DeploySite', {
        sources: [s3deploy.Source.asset(distDir)],
        destinationBucket: bucket,
        distribution, // invalidate on deploy
      });
    } else {
      cdk.Annotations.of(this).addWarning('frontend/dist not found — run `npm run build` in frontend/ then redeploy to publish the site');
    }

    new cdk.CfnOutput(this, 'SiteUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'ApiViaCloudFront', { value: `https://${distribution.distributionDomainName}/api` });
  }
}
