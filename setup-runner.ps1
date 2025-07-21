mkdir actions-runner; cd actions-runner
Invoke-WebRequest -Uri https://github.com/actions/runner/releases/download/v2.326.0/actions-runner-win-x64-2.326.0.zip -OutFile actions-runner-win-x64-2.326.0.zip
Add-Type -AssemblyName System.IO.Compression.FileSystem ; [System.IO.Compression.ZipFile]::ExtractToDirectory("$PWD/actions-runner-win-x64-2.326.0.zip", "$PWD")

./config.cmd --url https://github.com/gulblbl2025/Signal-Server --token BUT7A5VKZFQHIRE6AJ5QDCLIPEIGW
# ./config.cmd --url https://github.com/gulblbl2025/Signal-Server --token BUT7A5QXWCXFFAKBW4P35NLIPETLS
# ./config.cmd --url https://github.com/gulblbl2025/Signal-Server --token BUT7A5RA4S32UXUHAP5NZGLIPE2CC

./run.cmd

# runs-on: self-hosted
