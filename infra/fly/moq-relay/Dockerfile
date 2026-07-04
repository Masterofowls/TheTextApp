FROM moqdev/moq-relay:latest

COPY relay.toml /etc/moq/relay.toml

# Use the image entrypoint; pass our Fly config as the sole argument.
CMD ["/etc/moq/relay.toml"]
