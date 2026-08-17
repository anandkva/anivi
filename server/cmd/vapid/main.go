package main

import (
	"fmt"

	"github.com/anivi/server/push"
)

func main() {
	priv, pub, err := push.GenerateKeys()
	if err != nil {
		panic(err)
	}
	fmt.Printf("ANIVI_VAPID_PUBLIC_KEY=%s\nANIVI_VAPID_PRIVATE_KEY=%s\n", pub, priv)
}
