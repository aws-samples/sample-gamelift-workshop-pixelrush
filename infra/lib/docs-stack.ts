import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Self-hosted workshop tutorial site (the Hugo build of workshop/):
 * CloudFront + private S3 (OAC), same public-entry pattern as the game
 * frontend. Build the site first — see workshop/README.md — so that
 * workshop/public exists, then deploy this stack.
 */
export class DocsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'DocsBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3 REST origins don't resolve directory indexes — rewrite /foo/ (and
    // extensionless /foo) to /foo/index.html so Hugo's pretty URLs work.
    const indexRewrite = new cloudfront.Function(this, 'IndexRewrite', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var req = event.request;
          if (req.uri.endsWith('/')) {
            req.uri += 'index.html';
          } else if (!req.uri.includes('.')) {
            req.uri += '/index.html';
          }
          return req;
        }
      `),
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        functionAssociations: [{
          function: indexRewrite,
          eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        }],
      },
      defaultRootObject: 'index.html',
      // Hugo emits real directories with index.html, not an SPA — map 403/404
      // (S3 AccessDenied for missing keys) to the site's own 404 page.
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, responsePagePath: '/404.html' },
        { httpStatus: 404, responseHttpStatus: 404, responsePagePath: '/404.html' },
      ],
      comment: 'PixelRush workshop tutorial site (Hugo)',
    });

    const publicDir = path.join(__dirname, '../../workshop/public');
    if (fs.existsSync(publicDir)) {
      new s3deploy.BucketDeployment(this, 'DeployDocs', {
        sources: [s3deploy.Source.asset(publicDir)],
        destinationBucket: bucket,
        distribution,
      });
    } else {
      cdk.Annotations.of(this).addWarning('workshop/public not found — build the Hugo site first (see workshop/README.md), then redeploy');
    }

    new cdk.CfnOutput(this, 'DocsUrl', { value: `https://${distribution.distributionDomainName}` });
  }
}
