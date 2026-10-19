# go-api-starter

A minimal Go API using the standard library.

```bash
go mod download
go run .
```

Run from this project's root with the Go version required by [go.mod](go.mod).
The default port is 8080; set `PORT` in your shell to override it. The handlers live
in [main.go](main.go).

Routes:

- `GET /`
- `GET /healthz`

Use `go build ./...` to compile and `go test ./...` when adding tests.
