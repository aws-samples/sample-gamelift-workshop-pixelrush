---
title: "Appendix A: GameLift Anywhere (Optional)"
chapter: true
weight: 80
---
*Duration: ~15 minutes · requires Modules 1–3 completed*

A game session hosted on **your own machine**, orchestrated by Amazon GameLift Servers.
Same Server SDK code you read in Module 3, same lifecycle — different compute:
instead of an AWS-managed EC2 instance, the fleet's compute is your laptop or
your cloud development machine.

Take this appendix if you want to see how studios iterate on server code in
seconds instead of waiting ~15 minutes for a fleet to activate, or if you need
hybrid/on-premises hosting.

{{% notice info %}}
Nothing new gets deployed here — your stack already contains an Anywhere fleet
(it is created regardless of the `stage` flag), so this appendix only registers
a compute against it and leaves your managed EC2 fleet untouched.
{{% /notice %}}
