mkdir actions-runner && cd actions-runner

OS="$(uname -s)"

if [[ "$OS" == "Darwin" ]]; then
  # macOS
  RUNNER_TAR="actions-runner-osx-x64-2.326.0.tar.gz"
elif [[ "$OS" == "Linux" ]]; then
  # Linux
  RUNNER_TAR="actions-runner-linux-x64-2.326.0.tar.gz"
else
  echo "Unsupported OS: $OS"
  exit 1
fi

curl -o $RUNNER_TAR -L https://github.com/actions/runner/releases/download/v2.326.0/$RUNNER_TAR
tar xzf ./$RUNNER_TAR

./config.sh --url https://github.com/gulblbl2025/Signal-Server --token BUT7A5S653NAKKF72H3EMFLIPE6TW
./run.sh
